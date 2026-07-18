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

// Everything the worker needs to build the real ctx.rest closure. schemaName/callerAuthorization
// are internal-only -- not copied verbatim into the ctx object handed to function code (which
// only ever sees the public shape below).
export interface InvocationCtxWire {
  body: unknown;
  headers: Record<string, string>;
  query: Record<string, string>;
  project: { id: string; slug: string; schemaName: string };
  auth: { sub: string; role: string; email: string } | null;
  callerAuthorization: string | null;
}

// The public invocation contract (scope.md §26 point 3) -- what a function's handler actually
// receives. `rest` is constructed locally inside the worker (functions can't be sent over
// workerData/JSON), pre-bound to POSTGREST_URL with the invoking caller's own JWT forwarded.
export interface InvocationCtx {
  body: unknown;
  headers: Record<string, string>;
  query: Record<string, string>;
  project: { id: string; slug: string };
  auth: { sub: string; role: string; email: string } | null;
  rest: (path: string, init?: RequestInit) => Promise<Response>;
}

export interface FunctionResult {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type WorkerMessage = { ok: true; result: FunctionResult } | { ok: false; error: string };
