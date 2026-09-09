// Wire shape of a control-server -> function-runner POST /run call (scope.md §26 point 5).
// `code` and `ctx` are already-resolved values -- the runner looks nothing up itself and holds
// no database credential, which is the actual cross-project isolation property (§26 point 7b),
// not merely a convention.
export interface RunRequestBody {
  functionId: string;
  code: string;
  timeoutMs: number;
  ctx: InvocationCtxWire;
}

// Everything the worker needs to build the real ctx.rest/ctx.secrets closures.
// schemaName/callerAuthorization/secretsToken are internal-only -- not copied verbatim into the
// ctx object handed to function code (which only ever sees the public shape below).
export interface InvocationCtxWire {
  body: unknown;
  headers: Record<string, string>;
  query: Record<string, string>;
  project: { id: string; slug: string; schemaName: string };
  // sub/email are null for a Scheduler-fired invocation (scope.md §27 point 3, Phase 13) -- a
  // scheduled run has no invoking user.
  auth: { sub: string | null; role: string; email: string | null } | null;
  callerAuthorization: string | null;
  // Authorizes this one invocation's ctx.secrets.get() callback into control-server's
  // /internal/vault/resolve (scope.md §30 point 5) -- minted per-invocation by
  // FunctionsService.invoke(), never reused across calls.
  secretsToken: string;
}

// The public invocation contract (scope.md §26 point 3, extended by §30 point 5) -- what a
// function's handler actually receives. `rest`/`secrets` are constructed locally inside the
// worker (functions can't be sent over workerData/JSON): `rest` pre-bound to POSTGREST_URL with
// the invoking caller's own JWT forwarded, `secrets` calling back into control-server per lookup
// rather than handing the worker every one of the project's secrets up front.
export interface InvocationCtx {
  body: unknown;
  headers: Record<string, string>;
  query: Record<string, string>;
  project: { id: string; slug: string };
  // sub/email are null for a Scheduler-fired invocation (scope.md §27 point 3, Phase 13) -- a
  // scheduled run has no invoking user.
  auth: { sub: string | null; role: string; email: string | null } | null;
  rest: (path: string, init?: RequestInit) => Promise<Response>;
  secrets: { get: (name: string) => Promise<string | null> };
}

export interface FunctionResult {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type WorkerMessage = { ok: true; result: FunctionResult } | { ok: false; error: string };
