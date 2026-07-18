import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../config/env.schema';
import { FunctionInvocationsRepository } from './function-invocations.repository';
import { FunctionsRepository } from './functions.repository';
import { FunctionRow } from './functions.types';

// Extra grace period on top of a function's own timeout_ms: the runner's internal
// worker.terminate() timer is the "real" enforcement point (scope.md §26 point 5); this is just
// a backstop against a hung/unresponsive runner HTTP layer, not the primary timeout mechanism.
const RUNNER_CALL_GRACE_MS = 2000;

export type InvokeResult =
  | { kind: 'success'; status: number; body: unknown; headers?: Record<string, string> }
  | { kind: 'function-error'; message: string }
  | { kind: 'timeout' }
  | { kind: 'unavailable' };

export interface InvokeParams {
  fn: FunctionRow;
  project: { id: string; slug: string; schemaName: string };
  auth: { sub: string; role: string; email: string } | null;
  body: unknown;
  headers: Record<string, string>;
  query: Record<string, string>;
  callerAuthorization: string | null;
}

function toPublicFunction(row: FunctionRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    code: row.code,
    timeoutMs: row.timeout_ms,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class FunctionsService {
  private readonly runnerUrl: string;

  constructor(
    private readonly functions: FunctionsRepository,
    private readonly invocations: FunctionInvocationsRepository,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.runnerUrl = config.get('FUNCTION_RUNNER_URL', { infer: true });
  }

  async list(projectId: string) {
    const rows = await this.functions.list(projectId);
    return rows.map(toPublicFunction);
  }

  async create(projectId: string, name: string, code: string, timeoutMs: number | null) {
    const existing = await this.functions.findByProjectAndName(projectId, name);
    if (existing) {
      throw new ConflictException(`Function "${name}" already exists`);
    }
    const row = await this.functions.create(projectId, name, code, timeoutMs ?? 10000);
    return toPublicFunction(row);
  }

  async update(id: string, patch: { code?: string; timeoutMs?: number }) {
    const row = await this.functions.update(id, patch);
    if (!row) {
      throw new NotFoundException('Function not found');
    }
    return toPublicFunction(row);
  }

  async delete(id: string) {
    const row = await this.functions.delete(id);
    if (!row) {
      throw new NotFoundException('Function not found');
    }
    return { deleted: true };
  }

  async getByProjectAndNameOrThrow(projectId: string, name: string): Promise<FunctionRow> {
    const fn = await this.functions.findByProjectAndName(projectId, name);
    if (!fn) {
      throw new NotFoundException(`Function "${name}" not found`);
    }
    return fn;
  }

  async listInvocations(functionId: string) {
    const rows = await this.invocations.listByFunction(functionId);
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      durationMs: row.duration_ms,
      error: row.error,
      invokedAt: row.invoked_at.toISOString(),
    }));
  }

  // The only place a function's code and the invoking caller's context ever leave
  // control-server. function-runner is handed exactly what it needs for this one call and looks
  // nothing else up (scope.md §26 point 7b) — the project/function resolution above this method
  // (WHERE project_id = $1 AND name = $2, point 7a) is the actual isolation boundary, not
  // anything happening here.
  async invoke(params: InvokeParams): Promise<InvokeResult> {
    const start = Date.now();
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), params.fn.timeout_ms + RUNNER_CALL_GRACE_MS);

    let result: InvokeResult;
    try {
      const res = await fetch(`${this.runnerUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          functionId: params.fn.id,
          code: params.fn.code,
          timeoutMs: params.fn.timeout_ms,
          ctx: {
            body: params.body,
            headers: params.headers,
            query: params.query,
            project: params.project,
            auth: params.auth,
            callerAuthorization: params.callerAuthorization,
          },
        }),
        signal: controller.signal,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        status?: number;
        body?: unknown;
        headers?: Record<string, string>;
        error?: string;
      };

      if (res.status === 200) {
        result = { kind: 'success', status: payload.status ?? 200, body: payload.body, headers: payload.headers };
      } else if (res.status === 504) {
        result = { kind: 'timeout' };
      } else {
        result = { kind: 'function-error', message: payload.error ?? 'Function execution failed' };
      }
    } catch {
      // Covers both a genuine network failure (function-runner unreachable/restarting) and our
      // own AbortController firing — either way, control-server itself is unaffected, which is
      // the whole point of function-runner being a separate process (scope.md §26 point 5).
      result = { kind: 'unavailable' };
    } finally {
      clearTimeout(abortTimer);
    }

    await this.invocations.record({
      functionId: params.fn.id,
      status: result.kind,
      durationMs: Date.now() - start,
      error: result.kind === 'function-error' ? result.message : result.kind === 'unavailable' ? 'function-runner unavailable' : null,
    });

    return result;
  }
}
