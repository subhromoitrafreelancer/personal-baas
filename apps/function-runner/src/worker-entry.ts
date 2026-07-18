import { parentPort, workerData } from 'node:worker_threads';
import * as esbuild from 'esbuild';
import { FunctionResult, InvocationCtx, InvocationCtxWire, WorkerMessage } from './types';

// Capability level: full Node API access (require/fs/process/child_process/network all
// available exactly like a normal Node module) -- a deliberate choice, not an oversight. This
// platform's actual trust model is a single admin who already has unrestricted SQL execution via
// the admin console (scope.md §5.2); sandboxing function code more tightly than that would be
// inconsistent with the rest of the platform. Isolation here comes entirely from the process
// boundary (this whole service is a separate OS process from control-server) plus the
// fresh-worker-per-invocation + timeout discipline below, not capability restriction.
function buildRestClient(schemaName: string, callerAuthorization: string | null) {
  const base = process.env.POSTGREST_URL ?? '';
  return async (path: string, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? 'GET').toString().toUpperCase();
    // Same Accept-Profile (reads) / Content-Profile (writes) convention PostgREST needs once
    // more than one project's schema is exposed (scope.md §23) -- mirrors
    // packages/client-sdk/src/http.ts's profileHeaderName exactly.
    const profileHeader = method === 'GET' || method === 'HEAD' ? 'Accept-Profile' : 'Content-Profile';
    const headers = new Headers(init.headers);
    headers.set(profileHeader, schemaName);
    if (callerAuthorization) {
      headers.set('Authorization', callerAuthorization);
    }
    return fetch(`${base}${path}`, { ...init, headers });
  };
}

async function run(): Promise<void> {
  const { code, ctx } = workerData as { code: string; ctx: InvocationCtxWire };
  try {
    // Transpiles both TypeScript syntax and `export default` ESM syntax down to plain CommonJS
    // in one pass -- matches scope.md §26 point 3's literal `export default async function`
    // invocation contract without the runner needing any real ESM/TS parsing of its own.
    const transpiled = esbuild.transformSync(code, { loader: 'ts', format: 'cjs' });

    const mod: { exports: { default?: (ctx: InvocationCtx) => Promise<FunctionResult> } } = { exports: {} };
    // Deliberate use of the Function constructor: this *is* the function-execution primitive,
    // not incidental dynamic code.
    const wrapped = new Function('module', 'exports', 'require', transpiled.code);
    wrapped(mod, mod.exports, require);

    const handler = mod.exports.default;
    if (typeof handler !== 'function') {
      throw new Error('Function code must `export default` an async handler');
    }

    const invocationCtx: InvocationCtx = {
      body: ctx.body,
      headers: ctx.headers,
      query: ctx.query,
      project: { id: ctx.project.id, slug: ctx.project.slug },
      auth: ctx.auth,
      rest: buildRestClient(ctx.project.schemaName, ctx.callerAuthorization),
    };

    const result = await handler(invocationCtx);
    const message: WorkerMessage = { ok: true, result: result ?? {} };
    parentPort?.postMessage(message);
  } catch (err) {
    const message: WorkerMessage = { ok: false, error: err instanceof Error ? err.message : String(err) };
    parentPort?.postMessage(message);
  }
}

void run();
