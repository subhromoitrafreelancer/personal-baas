# Personal BaaS — Implementation Plan

## Context

`scope.md` defines a self-hosted BaaS that turns a Postgres schema into REST APIs via PostgREST, with a NestJS control service handling admin SQL execution, auth, and API configuration. The repo is currently empty (no code, not a git repo) — this is a greenfield build. The plan below breaks the 7 phases in `scope.md` §17 into small, single-concern PRs suitable for incremental review, using the stack choices confirmed with the user:

- **Control service**: Node.js + TypeScript + NestJS, modular monolith
- **DB access (control service only)**: raw `pg` driver + `node-pg-migrate` for its own platform/auth schema migrations — no ORM, since admin SQL execution is a first-class feature and app-table access always goes through PostgREST, never through the control service
- **Admin UI**: server-rendered from **inside** the control service (no separate `admin-web` app) using NestJS's Handlebars view engine (`hbs`) + static vanilla JS/CSS assets — classic page-based MVC (controller renders a view; vanilla JS on the page calls the same server's `/admin/v1` JSON API)
- **Monorepo**: npm workspaces, no extra orchestrator
- **Reverse proxy**: Caddy (simplest config, easy local TLS later) — swappable if this is wrong
- **SQL editor widget**: CodeMirror 6 (vendored ESM build), not Monaco — Monaco needs a bundler/worker setup that conflicts with the "plain vanilla JS, no build step" admin UI

Everything else (roles, schemas, RLS model, JWT design, phase scope) follows `scope.md` §§3–19 as written; those are treated as frozen decisions, not open questions.

## Repo layout

```
personal-baas/
├── apps/
│   └── control-server/            # NestJS: admin API + admin UI + auth + rest config
│       ├── src/
│       │   ├── admin-ui/          # hbs views + public/ (css/js), page-based MVC
│       │   ├── modules/
│       │   │   ├── health/
│       │   │   ├── config/
│       │   │   ├── admin-auth/    # platform administrator login/session
│       │   │   ├── sql-console/
│       │   │   ├── db-explorer/
│       │   │   ├── postgrest-config/
│       │   │   ├── auth/          # application user auth (/auth/v1/*)
│       │   │   ├── users/         # admin user management
│       │   │   ├── api-keys/
│       │   │   └── audit/
│       │   ├── common/            # guards, filters, interceptors
│       │   └── main.ts
│       ├── migrations/            # node-pg-migrate: platform + auth schema only
│       └── test/
├── packages/
│   ├── client-sdk/
│   ├── shared-types/
│   └── database-bootstrap/        # one-time role/schema init SQL (platform/auth/api/private)
├── infrastructure/
│   ├── docker/                    # docker-compose.yml, Dockerfiles
│   ├── postgres/                  # docker-entrypoint-initdb.d scripts, event-trigger SQL
│   ├── postgrest/                 # postgrest.conf template
│   └── proxy/                     # Caddyfile
├── examples/
│   └── todo-app/
└── docs/
```

Key distinction: `database-bootstrap` (Postgres container init — creates roles + empty `platform`/`auth`/`api`/`private` schemas, runs once as superuser) is separate from `node-pg-migrate` (versioned migrations for the control service's own `platform`/`auth` tables). The `api`/`private` schemas are never migrated by tooling — developers populate them via the SQL editor, per the product's core workflow.

Admin console session: a signed httpOnly cookie JWT, keyed with its **own** signing secret distinct from the application-user JWT keys (§8) — keeps admin auth and app auth cryptographically separate even though both are JWTs.

---

## Phase 0 — Repository & runtime foundation

1. **Monorepo scaffold** — root `package.json` (npm workspaces), base `tsconfig.json`, ESLint/Prettier config, `.gitignore`, empty folder skeleton, README stub.
2. **NestJS bootstrap** — `apps/control-server`: `AppModule`, env validation (`@nestjs/config` + schema validation), `nestjs-pino` structured logging, `main.ts`.
3. **Health module** — `/health` (liveness) and `/health/ready` (DB reachability check).
4. **Postgres bootstrap** — `infrastructure/postgres` init scripts: `baas_admin`, `authenticator`, `anon`, `authenticated`, `service_role` roles; empty `platform`, `auth`, `api`, `private` schemas. `packages/database-bootstrap` holds the source SQL.
5. **node-pg-migrate wiring** — migration runner in control-server, `migrate:up/down/create` npm scripts, first migration creating `platform.settings`.
6. **PostgREST service** — Dockerfile/compose entry, base `postgrest.conf` (authenticator role, `api` schema — empty, no tables yet).
7. **Caddy reverse proxy** — Caddyfile routing `/auth/*` → control-server, `/admin/*` → control-server, `/rest/*` → PostgREST, single entry on `:8000`.
8. **docker-compose.yml assembly** — wires postgres + postgrest + control-server + caddy, `.env.example`, dev setup docs.
   - **Acceptance**: `docker compose up` starts all services; `curl localhost:8000/admin/v1/health` and `curl localhost:8000/rest/v1/` both respond.

## Phase 1 — SQL editor & database explorer

1. **Admin identity + session** — `platform_admins` table (via migration), login page (hbs), httpOnly-cookie JWT session, `AdminAuthGuard` on all `/admin/*` routes and pages.
2. **Admin DB connection module** — dedicated `pg.Pool` using `baas_admin` role, `statement_timeout`, per-query cancellable connections (separate connection issuing `pg_cancel_backend`).
3. **SQL execute API** — `POST /admin/v1/sql/execute` (single statement + full script modes), row-limit enforcement, structured error output (message, line, position), audit log entry per execution (statement text, excluding known-sensitive patterns).
4. **SQL editor page** — `/admin/sql`: CodeMirror 6 editor, results table, CSV export, execution duration, error display — vanilla JS calling the API from #3.
5. **Execution history** — `admin_sql_history` table + list endpoint + history panel on the SQL editor page.
6. **SQL file upload** — multipart upload endpoint with size cap, feeds into script-execution flow from #3.
7. **Database object explorer** — `GET /admin/v1/database/objects` (schemas, tables, views, columns, PK/FK/unique, indexes, functions, RLS status, policies via `information_schema`/`pg_catalog`) + explorer page.
8. **Timeout/cancel/limit verification** — manual + scripted check: long-running query is cancellable, oversized result set is capped, runaway statement hits `statement_timeout`.

## Phase 2 — Automatic REST Data API

Reconsidered after Phase 1 landed (see docs/implementation-plan.md history / session notes):
PostgREST is already fully configured via docker-compose env vars (Phase 0), so there's no
"config module" left to build. And a database-level event trigger fires for *any* DDL regardless
of source (SQL console, migrations, direct psql), which makes a heuristic "detect DDL in the SQL
console and NOTIFY" step both redundant and less reliable — dropped in favor of the event trigger
alone. Creating an event trigger requires Postgres **superuser**, which `baas_admin` is not, so
this lives in the bootstrap SQL (already run as the real superuser during container init via
`docker-entrypoint-initdb.d`), not a node-pg-migrate migration.

1. **Schema-reload event trigger** — `packages/database-bootstrap/sql`: idempotent function +
   event trigger on `ddl_command_end`/`sql_drop` that fires `NOTIFY pgrst, 'reload schema'`.
   PostgREST v12 listens on the `pgrst` channel by default (`db-channel-enabled`), so no
   PostgREST config changes are needed.
2. **API explorer page** — `/admin/api`: lists `api`-schema tables/views/functions (reusing the
   object-explorer's catalog data) with generated cURL + fetch snippets per object.
3. **OpenAPI passthrough** — surface PostgREST's built-in OpenAPI doc in the admin UI.
4. **End-to-end acceptance verification** — `create table api.tasks (...)` in the SQL editor →
   `GET/POST /rest/v1/tasks` work immediately, no restart.

## Phase 3 — Application authentication

Reordered slightly from the original numbering so each item only depends on ones already
built: the JWT signing module moves before signup/login (both need it indirectly or directly),
and signup (which issues no token) moves before login.

1. **Auth schema migrations** — `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `auth.password_reset_tokens`, `auth.audit_events` (node-pg-migrate, per §7). `identities` is created for schema completeness per §7 but stays unwritten in v1 (no social login yet).
2. **JWT signing module** — Ed25519 keypair loading (env/mounted files), sign/verify helpers, 15-min access-token lifetime, claims per §8.
3. **Argon2id hashing + signup** — `POST /auth/v1/signup`.
4. **Login + session/token issuance** — `POST /auth/v1/login`: verify password, create `auth.sessions` row, issue Ed25519-signed access JWT + opaque refresh token (stored as a SHA-256 hash, never plaintext, per §7).
5. **Refresh + rotation** — `POST /auth/v1/token`: refresh-token rotation with `family_id`/`parent_token_id` reuse detection (reuse of a consumed/revoked token revokes the whole family + session).
6. **User self-service** — `GET /auth/v1/user`, change-password, `POST /auth/v1/logout` (session revocation).
7. **Admin user management** — `admin/v1/users` API + page: list/search, create, disable/enable, admin-generated reset link or temp password (reset-token *consumption* endpoint is Phase 6 #6, per that item's own note).
8. **Auth audit trail** — write to `auth.audit_events` on signup/login/logout/refresh-reuse/password-change/admin actions; `/admin/audit` list page.
   - **Acceptance**: register → login → refresh → revoke session → further refresh fails, all via curl against `/auth/v1/*`. The PostgREST leg ("call `/rest/v1/tasks` with the JWT") is verified once Phase 4 #2 wires PostgREST to verify this service's JWTs — `anon`/`authenticated`/`service_role` roles already exist from the Phase 0 bootstrap, but PostgREST isn't yet configured with the public key.

## Phase 4 — Database authorization & RLS integration

Reconsidered before starting, once Phase 0/3 state was checked and PostgREST's actual JWT
support was researched: `authenticator`/`anon`/`authenticated`/`service_role` already exist
from the Phase 0 bootstrap (`packages/database-bootstrap/sql/001_roles.sql.template`), and
`authenticator` already has `anon`/`authenticated`/`service_role` granted to it — so a
standalone "role + grants migration" item would be a no-op. Confirmed via
`jose-jwt` (PostgREST's underlying JWT library) source that `Ed25519PublicJwk` is a real,
supported key-material constructor — our Ed25519/EdDSA signing choice from Phase 3.2 works
with PostgREST's `jwt-secret` once the public key is expressed as a JWK (not PEM; PostgREST's
asymmetric `jwt-secret` config takes a literal JWK object, not a PEM string). Merged the
original items 1 and 2 into one PR since #1 had no remaining content of its own.

1. **JWT ↔ PostgREST integration** — export the Ed25519 public key as a JWK, wire it into
   PostgREST via `PGRST_JWT_SECRET` (+ `PGRST_JWT_AUD`), add a small `auth.uid()` SQL helper
   (reads `request.jwt.claims->>'sub'`) so RLS policies have an ergonomic way to reference the
   calling user, and verify `request.jwt.claims` / role-switching actually works against a
   disposable probe table.
2. **RLS snippet library** — reusable SQL templates (owner-only via `auth.uid()`,
   public-read/auth-write, admin-only via `service_role`, authenticated CRUD) selectable from
   the SQL editor, each paired with the `GRANT` statements it needs — table-level grants are
   never automatic (scope.md §9: "anon: No access unless explicitly granted"), so a policy
   without a matching grant is a common trap the snippets should avoid by construction.
3. **Exposure warnings** — the object explorer already returns `rlsEnabled`/`rlsForced`/
   `policies` per table (Phase 1.7); this item is UI-only — surface a clear warning when an
   `api`-schema table has RLS off or zero policies, instead of today's plain on/off badge.
4. **API key management** — `platform.api_keys` bookkeeping table + `admin/v1/api-keys` API
   and page to issue publishable (`anon`) / secret (`service_role`) long-lived JWTs and mark
   them revoked in our own records. Full cryptographic rotation/enforcement (`kid`-based
   multi-key verification, actually rejecting a revoked key before its expiry) stays deferred
   to Phase 6 #2, which already owns "complete API-key rotation flow."
5. **RLS verification** — two test users, each created via real `/auth/v1/signup` +
   `/auth/v1/login`, see only their own rows in a disposable owner-only-RLS table through the
   same PostgREST endpoint — end to end through the real JWT path, not simulated.
   - **Acceptance**: two-user RLS isolation test on a disposable table, verified through
     PostgREST with real signup/login-issued JWTs (the Phase 3 acceptance test's deferred
     `/rest/v1/tasks`-with-JWT leg is folded into this).

## Phase 5 — Developer experience

1. **`client-sdk` scaffold** — `createClient()`, fetch-based HTTP layer, `client.auth` (signIn/signUp/signOut, session persistence, auto refresh).
2. **Query builder** — `client.from(table)` with `select/insert/update/delete/upsert` + filter operators from §15.
3. **RPC support** — `client.rpc(functionName)`.
4. **SDK build/packaging** — `tsup`/`tsc` build, unit tests against a mocked fetch layer.
5. **Copyable snippets** — extend the API explorer (Phase 2 #2) with generated JS-SDK examples alongside cURL.
6. **Env file generator** — admin UI action producing a `.env` with `BAAS_URL`/`BAAS_PUBLISHABLE_KEY`/`BAAS_SERVICE_KEY`.
7. **Docs** — install/deploy guide in `docs/`.
   - **Acceptance**: a new HTML page can auth + CRUD against `tasks` with zero backend code.

The sample app originally planned here (`examples/html-todo-app`, using the SDK) was built ahead of schedule as Phase 7a's `examples/todo-app` instead — directly against REST/Auth/Storage rather than the (still-unbuilt) SDK, since it also needed to demonstrate Storage.

## Phase 6 — Operational hardening

Phase 6 originally had 10 items (see Phase 6b below). The user explicitly narrowed this pass to
4 — TLS, password-reset, security headers/CORS, and metrics — deferring the rest behind the two
new feature phases (Storage, Realtime) rather than dropping them. No Phase 5 dependency exists
for any of these (verified: none of the original 10 items reference `client-sdk`, the env-file
generator, or the Phase 5 docs deliverable), so this phase can run before Phase 5 safely.

1. **TLS** — Caddy auto-HTTPS or provided certs, docs.
2. **Security headers + CORS** — `helmet`, CORS policy.
3. **Password-reset self-service** — token-consumption endpoint completing the flow started in Phase 3 (still no outbound email).
4. **Metrics + healthchecks** — `prom-client` metrics endpoint, container healthchecks in compose.
   - **Acceptance**: HTTPS works end-to-end through Caddy; security headers/CORS verified via curl response headers; a password-reset token can be consumed exactly once to set a new password; `/metrics` returns Prometheus-format output and compose healthchecks report healthy.

## Phase 7 — Storage

MinIO-backed object storage (§21 in `scope.md`). Promoted from scope.md's "Later Roadmap" —
the user considers this near-required ("most apps will require this"), unlike Realtime below.

The user narrowed this pass to items 1, 2, 3, and 6 — the core vertical slice (MinIO service,
schema, object CRUD API, admin UI) — deferring #4 (signed URLs) and #5 (per-upload size limits)
to a follow-up, same narrowing pattern as Phase 6/6b. Verified end-to-end against the live dev
stack: admin bucket create/list, admin object upload/download/delete, and the public
`/storage/v1/object/:bucket/*path` route with two real signed-up/logged-in users — owner-only
read/write on a private bucket, public-bucket read by a non-owner, non-owner write/delete
rejected, and `..`/`%2e%2e` path-traversal segments rejected with 400.

1. **MinIO service + bootstrap** — new `minio` service in `docker-compose.yml` (own named volume, root credentials via env, no unnecessary host port exposure), single bucket auto-created at bootstrap (mirrors `database-bootstrap`'s role/schema init pattern).
2. **`storage` schema migrations** — `storage.buckets` (id, name, public boolean, size_limit_bytes, created_at) and `storage.objects` (id, bucket_id, path, owner user id, size, content_type, created_at) via `node-pg-migrate`, same convention as `platform`/`auth`.
3. **Storage API module** — new control-server module, `POST/GET/DELETE /storage/v1/object/:bucket/*path`, authenticated via the existing app-user JWT; checks caller permission against `storage.buckets`/`storage.objects` (owner-based + public-bucket-read) before streaming to/from MinIO using a service credential never exposed to browsers.
4. **Signed URLs** — `POST /storage/v1/object/sign/:bucket/*path`, short-lived presigned MinIO URL, permission-checked at signing time only.
5. **Size limits** — per-upload cap enforced in the storage module (mirrors the existing SQL-file-upload size-cap precedent), configurable via env.
6. **Admin UI** — new `/admin/storage` page (bucket list, object browser, manual upload/download for testing), following the existing page-controller + `{{> topbar}}`/`{{> footer}}` partial pattern.
   - **Acceptance**: create a bucket, upload an object with an authenticated JWT, download it back, confirm a non-owner/non-public request is rejected, confirm a signed URL works without the caller's own JWT.

## Phase 7a — Example Todo App

A standalone reference client demonstrating the full stack (Auth + REST + Storage) exactly as a
real third-party developer would consume it — no internal code, only the public HTTP API.
Supersedes the Phase 5 "Sample app" item above: built earlier and without the client-SDK
dependency (Phase 5 remains deferred), since it also needs to demonstrate Storage (Phase 7).
Runs after Phase 7, before Phase 8, per its dependency on Storage for attachments.

Built and verified end-to-end against the live dev stack: registered two separate users, confirmed
each sees only their own todos (RLS), added/toggled/deleted todos, and attached/downloaded/removed
a file on a todo through the real `/storage/v1/object/todo-attachments/*path` route.

1. **`api.todos` schema + RLS** — `examples/todo-app/schema.sql`: `todos` table (`id`, `user_id`, `title`, `done`, `attachment_path`, `created_at`, `updated_at`) plus the owner-only RLS policy set from `rls-snippets.js`, run once by hand through `/admin/sql` (per the established `api`/`private` schema convention — never migrated by tooling).
2. **Storage bucket provisioning** — a `todo-attachments` bucket created via the Phase 7 admin UI (or a direct `storage.buckets` insert) before first use; documented as a one-time setup step in the example's README.
3. **API client (`js/api.js`)** — thin `fetch` wrapper: `/auth/v1/signup`, `/auth/v1/login`, `/auth/v1/token` (refresh-on-401), `/rest/v1/todos` CRUD, `/storage/v1/object/todo-attachments/*path` upload/download/delete — a single `Authorization: Bearer` header throughout (publishable-key JWT pre-login, swapped for the session's access token post-login), matching this project's actual auth model (no separate `apikey` header, unlike Supabase).
4. **UI (`index.html` + `js/app.js` + jQuery)** — single-page view-toggle: register/login forms, todo list with add/toggle-done/delete, per-todo file attach/download/remove. Plain CSS, no build step; jQuery vendored locally (not CDN-loaded) so the directory works fully offline once copied — a deliberate, scoped first-time exception to this codebase's otherwise vanilla-JS-only convention.
5. **`config.js`** — the only file a developer edits after copying the directory: `{ baseUrl, anonKey }`.
   - **Acceptance**: copy `examples/todo-app/` to a fresh location, edit only `config.js` to point at a running stack and a freshly minted publishable key, open `index.html` in a browser, register a user, log in, create/toggle/delete todos, attach/download/remove a file on a todo — all without touching any other file.

## Phase 8 — Realtime (optional)

Table subscriptions (§22 in `scope.md`). Promoted from scope.md's "Later Roadmap," explicitly
lower priority than Phase 7. Uses triggers + `LISTEN`/`NOTIFY` (the same primitive Phase 2 #2/#3
already use for `NOTIFY pgrst` schema-reload), not full logical replication — avoids a new
Postgres role, a `wal_level=logical` config change, and replication-slot management for a
feature marked optional. GraphQL is not required and not used (PostgREST cannot support
subscriptions itself; realtime always needs a sibling WebSocket service regardless of GraphQL).

Reconsidered/detailed before starting, once the existing trigger/auth/module conventions were
checked against the codebase: `platform.notify_realtime_change()` does **not** belong in
`packages/database-bootstrap` despite mirroring `platform.notify_pgrst_reload_schema()` in
spirit — that function is a superuser-only **event trigger** (fires on DDL, no per-row context),
whereas a change-notification trigger is an ordinary row-level `AFTER INSERT/UPDATE/DELETE`
trigger, which `baas_admin` can create like any other object. It's therefore a normal
`node-pg-migrate` migration, same as every other `platform`/`auth` schema object — bootstrap
stays reserved for the things that genuinely require superuser. Also confirmed: no WebSocket
library (`ws`, `socket.io`, `@nestjs/websockets`) is installed anywhere in the repo yet, so item 2
adds one from scratch; and no existing code checks `has_table_privilege`/
`information_schema.table_privileges` for a role — the Phase 1.7 object-explorer query only
reports whether RLS is *enabled* on a table, not whether a role has a working grant — so item 3's
authorization check is new SQL, not a reuse. WebSocket auth reuses `AuthJwtService.verifyAccessToken`
directly (same as `AccessTokenGuard`, minus the Express `request` object a guard relies on) rather
than a new verification path, and `role`/`projectId` claims are already present on
`AppAccessTokenClaims`, so subscription authorization is project-scoped from day one, ahead of
Phase 9's schema-per-project rollout landing.

1. **Trigger infrastructure** — `platform.notify_realtime_change()`, added via `node-pg-migrate`
   (see reconsideration above, not `database-bootstrap`): a `language plpgsql` row-level trigger
   function that does `perform pg_notify('realtime_changes', payload::text)` on a single shared
   channel (not per-table — the fan-out module in #4 already needs to hold one persistent
   connection and match subscribers by table/filter in-process, so multiplying channels buys
   nothing). Payload is a JSON object: `{schema, table, operation, record}`, where `record` is
   `NEW` for `INSERT`/`UPDATE` and `OLD` for `DELETE` (`NEW` is null on delete) via
   `case when TG_OP = 'DELETE' then OLD else NEW end`. Postgres caps a `NOTIFY` payload at 8000
   bytes; the trigger body wraps the `pg_notify` call in its own `begin ... exception when others
   then null; end;` block so a wide row (large `text`/`jsonb` columns) that overflows the limit
   raises inside the trigger and is swallowed there — the actual `INSERT`/`UPDATE`/`DELETE` must
   never be rolled back just because its change notification couldn't fit. Attachment is manual,
   same as the RLS snippet library it's paired with: a new entry alongside `RLS_SNIPPETS` in
   `apps/control-server/src/admin-ui/public/js/rls-snippets.js` (or a sibling
   `realtime-snippets.js` following its identical export shape) providing the
   `create trigger <table_name>_realtime_notify after insert or update or delete on
   api.<table_name> for each row execute function platform.notify_realtime_change();` snippet,
   picked from the SQL editor's existing snippet picker.
2. **WebSocket gateway** — new `apps/control-server/src/modules/realtime/` module
   (`realtime.module.ts`/`.gateway.ts`/`.types.ts`; no `.service.ts` yet — item 2's scope is
   connection lifecycle + auth handshake only, not the subscription registry items 3/4 own),
   added to `app.module.ts`. Uses `@nestjs/websockets` with the `@nestjs/platform-ws` adapter
   (`ws`-based, not `socket.io` — no engine.io protocol overhead, consistent with this codebase's
   minimal-dependency raw-driver style) via `app.useWebSocketAdapter(new WsAdapter(app))` in
   `main.ts`. The gateway's own path is `/realtime/v1` (`@WebSocketGateway({ path: '/realtime/v1'
   })`), and — unlike `/rest/v1`, which PostgREST itself has no prefix for — `/realtime/*` is
   added to the shared `(routes)` snippet in `infrastructure/proxy/Caddyfile` with **no** `uri
   strip_prefix`: the request must reach control-server with `/realtime/v1` intact, same
   forward-as-is pattern as `/auth/*`/`/storage/*`. Caddy proxies the `Connection:
   Upgrade`/`Upgrade: websocket` handshake automatically, no extra directive. Auth: browsers'
   native `WebSocket` API cannot set an `Authorization` header, so the access
   token is passed as a query parameter (`wss://.../realtime/v1?access_token=<JWT>`, the common
   pattern for browser-native WS auth); `handleConnection` reads it from the raw upgrade request
   and calls `AuthJwtService.verifyAccessToken` directly, closing with WS code `4401` and a reason
   string on failure or missing token.
3. **Subscription authorization** — a small JSON message protocol over the single connection
   (not one socket per subscription): client sends `{type: 'subscribe', id, schema, table,
   filter?}` / `{type: 'unsubscribe', id}`; server replies `{type: 'subscribed', id}` or
   `{type: 'error', id, message}`. `filter`, if present, is restricted to the single shape
   `<column>=eq.<value>` (matching PostgREST's own `eq` operator spelling from scope.md §15, kept
   intentionally narrow per the "coarse model" framing below) and the column name is validated
   against `information_schema.columns` for that table before being accepted, to reject typos
   loudly instead of silently matching nothing. `schema` is resolved from the caller's JWT
   `projectId` claim via the existing `ProjectsService` (already present in the module list ahead
   of Phase 9 landing) rather than hardcoded to `'api'`, and any schema outside that resolved
   project schema is rejected before the grant check even runs (no privilege-probing of
   `platform`/`auth`/`private`). The grant check itself is new SQL — `select
   has_table_privilege($1, $2, 'SELECT')` — using the caller's JWT `role` claim (the shared
   `authenticated`/`anon`/`service_role`-style role, not a per-user role) against
   `'<resolved_schema>.<table>'`. This deliberately does **not** re-evaluate RLS per event — a
   subscriber whose shared role can `SELECT` the table at the grant level, but whose RLS policy
   would exclude the specific changed row, will still receive that row's `NOTIFY` payload unless
   excluded by their own equality filter. This is a known, accepted gap (coarse authorization, not
   per-event RLS), the same tradeoff scope.md §22 already calls out; the mitigation is the same
   pattern the Phase 7a todo-app already uses for its own RLS design — subscribe with
   `user_id=eq.<uuid>` so the filter does the narrowing the grant check doesn't.
4. **Event fan-out** — a dedicated single `pg.Client` (**not** a pooled connection — pool clients
   get recycled, which is incompatible with a long-lived `LISTEN`), added as its own `@Global()`
   module following the `DatabaseModule`/`AdminDbModule` teardown convention (`OnModuleDestroy`
   calling `client.end()`), connecting via the existing `DATABASE_URL`. On `onModuleInit`:
   `client.connect()`, `client.query('LISTEN realtime_changes')`, subscribe to the `notification`
   event. Because this connection lives outside pool management, it also needs its own
   reconnect-with-backoff handling (`error`/`end` listeners triggering a capped exponential
   backoff reconnect that re-issues `LISTEN` once restored, logged via the existing
   `nestjs-pino` logger) — a concern the pooled connections don't have since the pool itself
   handles client replacement. On each notification: `JSON.parse(payload)`, look up an in-memory
   registry (`Map<'schema.table', Set<{socket, filter}>>`) built from item 3's successful
   subscriptions, and deliver to sockets whose optional filter matches the parsed `record`
   in-process (no second DB round-trip per event). One incidental property worth keeping in mind
   for later horizontal scaling: Postgres `NOTIFY` fans out to every connection currently
   `LISTEN`-ing on the channel, so if the control-server is ever run as multiple replicas, each
   replica's own `LISTEN` connection receives every event independently and only forwards to its
   own locally-connected sockets — no extra fan-out infrastructure needed for that later, though
   today's deployment target is single-instance.
5. **Admin UI (minimal)** — a new `GET /admin/v1/realtime/stats` endpoint on the realtime module
   (admin-guarded, same as other `admin/v1/*` JSON endpoints) returning
   `{activeConnections, activeSubscriptions}` counted from the in-memory registry in #4; a
   `loadRealtimeCard()` added to `apps/control-server/src/admin-ui/public/js/dashboard.js`
   following the exact shape of the existing `loadAuditCard()` (fetch → `card(...)`/`errorCard(...)`
   → included in the bottom IIFE's `Promise.all([...])` alongside the current cards). A full
   realtime admin page (live event stream, per-connection subscription list) is deferred. Caveat
   worth a one-line note in the card's sub-label: the count reflects only this control-server
   instance's local connections (see the horizontal-scaling note in #4) — correct for today's
   single-instance deployment, a known limitation if that ever changes.
   - **Acceptance**: two WebSocket clients subscribe to the same table with different `user_id=eq.<uuid>` filters; an insert/update/delete from a third connection delivers only to the correctly-filtered subscriber(s).

## Phase 9 — Multi-project support

Design written up in `scope.md` §23 (see also §17 phase stub, §16/§18 promotion notes) after the
user confirmed "Option A" (per-project user pools + project-scoped JWTs, genuine isolation, not a
shared identity pool across projects). Two decisions were made explicitly when asked: (1) new-project
PostgREST reconfiguration is a **manual** `docker compose restart postgrest` step, not automated —
mounting the Docker socket into control-server so it could restart the container itself was
considered and rejected as a materially larger attack surface than anything else in the stack; (2)
the already-seeded project (created alongside the first admin, see #1) keeps the **existing** `api`
schema and `anon`/`authenticated`/`service_role` role names as-is rather than being renamed to
`api_default`/`*_default` — this keeps every existing dev flow, and the Phase 7a `examples/todo-app`
client, working with zero changes, at the cost of the default project being a named exception to the
`api_<slug>`/`<role>_<slug>` pattern every other project follows. `platform.projects` stores each
project's schema/role names explicitly (not always derived by string concatenation) specifically so
this exception is data, not a scattered `if slug === 'default'` special case in code.

Placed after Phase 8 rather than immediately after Phase 4 (where RLS/roles were originally designed)
because it changes the role/grant model those phases already shipped — Phase 6b stays last since it's
explicitly deferred at the user's direction and this phase doesn't change that ordering.

1. **`platform.projects` migration + seeding invariant** — table (`id`, `slug`, `name`,
   `schema_name`, `anon_role`, `authenticated_role`, `service_role_role`, `created_at`,
   `updated_at`) via node-pg-migrate. A data migration inserts the pre-existing project's row with
   `schema_name='api'`, `anon_role='anon'`, `authenticated_role='authenticated'`,
   `service_role_role='service_role'` — the legacy global names, unchanged. Extend
   `AdminAuthService`'s first-boot seeding to call `ProjectsService.ensureDefaultProject()`
   (idempotent — no-op once that row exists) *before* seeding `platform.platform_admins`: an admin
   is never seeded without at least one project present.
2. **Project-scoped role & schema provisioning (new projects only)** — `ProjectsService.create()`:
   slug validation (regex `^[a-z][a-z0-9_]{2,30}$`, reserved-word blocklist covering
   `platform`/`auth`/`api`/`private`/`storage`/`public`/`default`), then via the `baas_admin` pool:
   `CREATE SCHEMA api_<slug> AUTHORIZATION baas_admin`, `CREATE ROLE anon_<slug> NOLOGIN`,
   `CREATE ROLE authenticated_<slug> NOLOGIN`, `CREATE ROLE service_role_<slug> NOLOGIN BYPASSRLS`,
   grant all three to `authenticator`, then insert the `platform.projects` row with the derived
   names. Never invoked for the seeded project from #1 — its schema/roles already exist from the
   original Phase 0 bootstrap.
3. **`auth.users` / `platform.api_keys` project scoping** — migration adding
   `project_id uuid not null references platform.projects(id)` to both tables, backfilled to the
   seeded project's id (inserted in #1) before the `not null` constraint is applied; drop the
   global `lower(email)` unique index in favor of `(project_id, lower(email))`;
   `AuthUsersRepository`/`ApiKeysRepository` method signatures gain a required `projectId`.
4. **JWT project-scoping** — `AuthJwtService.signAccessToken`/`signApiKeyToken` look up the target
   project's stored `authenticated_role`/`anon_role`/`service_role_role` (never string-concatenated
   — the seeded project's are the unsuffixed legacy names) and embed both a `project_id` claim and
   the resolved `role` claim. For the seeded project this produces byte-identical claims to today
   (`role: 'authenticated'`), so existing sessions/clients see no behavior change.
5. **Auth endpoints resolve project from the existing publishable-key bearer** —
   `/auth/v1/signup`/`/login`/`/token` verify the pre-login `Authorization: Bearer
   <publishable-or-service-key-JWT>` as an API-key JWT (existing `signApiKeyToken`/verify logic),
   resolve `project_id` from `platform.api_keys`, and scope the `auth.users` lookup/creation to it
   — no new header. Implementation must first confirm this bearer is already mandatory on these
   routes per the Phase 7a client convention; if not yet enforced, this item also makes it so.
6. **PostgREST multi-schema config file** — switch the `postgrest` compose service from `PGRST_*`
   env vars to a mounted, writable `postgrest.conf` (shared volume with control-server), seeded
   with `db-schemas = "api"` (the pre-existing project listed first, preserving today's
   no-`Accept-Profile`-header behavior for existing clients). `ProjectsService.create()`/`delete()`
   append/remove that project's schema from the `db-schemas` line. Admin UI surfaces a "restart
   required" banner with the exact `docker compose restart postgrest` command after any change —
   manual, per the decision above.
7. **Admin UI — Projects page** — `/admin/projects`: list/create projects (slug + name form; the
   seeded project is shown with its slug/schema/roles read-only, not renameable); each row shows
   its schema name and a copy-to-clipboard restart reminder after creation. Project selector added
   to the SQL console / DB explorer / API-keys pages (defaults to the seeded project) so the single
   admin can operate on any project without cross-project ambiguity.
8. **Two-project isolation verification** — create a second project via #7, restart PostgREST
   once, sign up + log in a user in it, create a disposable `notes` table with owner-only RLS in
   its `api_<slug>` schema; confirm its JWT (`role: authenticated_<slug>`) is rejected/empty
   against the original project's `api` schema (`Accept-Profile: api`) and vice versa, at the
   Postgres role/grant level rather than via RLS alone — proving isolation doesn't depend on every
   project's SQL author remembering a `project_id` check.
   - **Acceptance**: existing flows (todo-app, any pre-existing signup/login/REST calls) keep
     working with zero client-side changes; a newly created second project gets a working
     signup/login/REST/RLS stack after exactly one `docker compose restart postgrest`; a
     project-A JWT is provably rejected against project B's schema at the Postgres role/grant
     level, and vice versa.

## Phase 6b — Operational hardening (deferred)

The 6 items deferred from the original Phase 6 list, resequenced behind Storage/Realtime at the
user's direction — not dropped.

1. **Key rotation** — JWT signing-key rotation with `kid`-based verification. (Note: "complete API-key rotation flow" from the original wording is already satisfied by the existing revoke-then-create-new flow shipped in Phase 4.4 + the API-key "view" feature — this item now scopes to just the application JWT signing keypair, which currently has no `kid` and cannot be rotated without invalidating all sessions.)
2. **Backup/restore** — `pg_dump`/`pg_restore` wrapper scripts + docs.
3. **Rate limiting & body limits** — NestJS throttler on `/auth`/`/admin`, PostgREST `max-rows`, request body size caps.
4. **Brute-force protection** — login attempt throttling/lockout per email + IP.
5. **Audit export** — CSV/JSON export of `auth.audit_events` and admin SQL history.
6. **Upgrade runbook** — docs covering upgrade procedure and secrets handling (env/mounted files only).

---

## Cross-cutting conventions

- **Testing**: Jest (NestJS default) for unit tests; Supertest for HTTP e2e tests against a real disposable Postgres (docker) — no mocking the database, since RLS/grants correctness is the actual thing under test.
- **PR size**: each numbered item above is one PR — single concern, independently reviewable and revertable.
- **Migrations**: only `node-pg-migrate` touches `platform`/`auth` schema shape; `api`/`private` are exclusively developer-driven via the SQL editor, never via tooling.

## Verification approach

- Phase 0: `docker compose up` + health-endpoint curl through the proxy.
- Phase 1: create table via SQL editor UI → confirm it appears in the object explorer; run a deliberately slow query → confirm cancel + timeout work.
- Phase 2: create `api.tasks` via SQL editor → immediately curl `/rest/v1/tasks` with no restart.
- Phase 3: full signup → login → refresh → revoke → refresh-fails flow via curl/script.
- Phase 4: two-user RLS isolation test on `api.tasks`.
- Phase 5: SDK/env-generator/docs items only, run in isolation once built. (deferred)
- Phase 6: curl over HTTPS + inspect security headers/CORS; consume a password-reset token exactly once; scrape `/metrics`.
- Phase 7: curl-based upload/download/signed-URL flow against the live MinIO container; confirm real data (including the new `storage` schema/volume) survives a rebuild.
- Phase 7a: copy `examples/todo-app/` to a scratch directory, point `config.js` at the running stack, exercise register→login→CRUD→upload→download→delete manually in a browser.
- Phase 8: two real WebSocket connections with different filters, verifying correct fan-out/exclusion — same rigor as the Phase 4.5 two-user RLS verification.
- Phase 9: create a second project, restart PostgREST once, confirm its user/JWT/RLS stack works independently and a cross-project `Accept-Profile` request is rejected at the role/grant level — plus a regression check that the pre-existing project's flows (including `examples/todo-app`) are unaffected.
- Phase 6b: exercise rate limits and backup/restore scripts against the dev stack. (deferred)
