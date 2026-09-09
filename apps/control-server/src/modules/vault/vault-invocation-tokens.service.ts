import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

interface TokenEntry {
  projectId: string;
  expiresAt: number;
}

// Mints and resolves the short-lived, per-invocation opaque token that authorizes a
// function-runner worker's ctx.secrets.get() callback into control-server (scope.md §30 point
// 5). This is the actual cross-project isolation boundary for that callback: control-server's
// own HTTP port is host-published (unlike function-runner's, which has none), so "reachable
// only over the internal docker network" cannot be relied on the way it is for control-server
// -> function-runner traffic — the callback needs a real, invocation-scoped credential instead.
//
// In-memory only, single control-server instance — same single-instance caveat already
// documented for Realtime (Phase 8) and the Scheduler (Phase 13); a token minted on one replica
// would not be resolvable on another. Not a concern for today's single-instance deployment
// target.
@Injectable()
export class VaultInvocationTokensService implements OnModuleDestroy {
  private readonly tokens = new Map<string, TokenEntry>();
  private readonly sweepInterval: NodeJS.Timeout;

  constructor() {
    // Backstop for the explicit revoke() call in FunctionsService.invoke()'s finally block —
    // covers any future code path that mints a token without a matching revoke (e.g. a crash
    // between mint and revoke).
    this.sweepInterval = setInterval(() => this.sweepExpired(), 60_000);
    this.sweepInterval.unref();
  }

  issue(projectId: string, ttlMs: number): string {
    const token = randomUUID();
    this.tokens.set(token, { projectId, expiresAt: Date.now() + ttlMs });
    return token;
  }

  resolve(token: string): string | null {
    const entry = this.tokens.get(token);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return null;
    }
    return entry.projectId;
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokens) {
      if (entry.expiresAt < now) {
        this.tokens.delete(token);
      }
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepInterval);
  }
}
