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

Scope narrowed by the user to 5 of the original 7 items — item 5 below (copyable JS-SDK snippets
in the API explorer) stays deferred; everything else ships, plus the Phase 6b "Upgrade runbook"
item folded in at the user's request since it's a docs deliverable with no other dependencies.
`client-sdk`'s core (original items 1-3) was already scaffolded ahead of this plan
(`packages/client-sdk/src/*.ts`, ~470 lines, written pre-plan) — this phase closes its two spec
gaps, then adds packaging, the env-file generator, and docs.

1. **`client-sdk` core — close spec gaps** — `src/client.ts` (`createClient`/`BaasClient`/`.from()`/`.rpc()`), `src/http.ts` (fetch layer, session persistence via `localStorage`, auto-refresh-and-retry-once on 401, `Accept-Profile`/`Content-Profile` schema header), `src/auth.ts` (signUp/signIn/signOut/restoreSession), `src/query-builder.ts` (select/insert/update/delete + eq/neq/gt/gte/lt/lte/like/ilike/is/in/order/limit/single/maybeSingle), and `src/storage.ts` (upload/download/remove, ahead of schedule) are already written. Two operators from scope.md §15's list are still missing and need adding: `upsert()` (`Prefer: resolution=merge-duplicates`) and `range()` (`Range` header, start/end pair as an alternative to `limit()`).
2. **SDK build/packaging** — add a `tsup` build producing `dist/` (ESM + `.d.ts`; package stays `"private": true`, workspace-internal, not npm-published), wire `build`/`test` scripts into `packages/client-sdk/package.json` so the root `npm run build --workspaces --if-present` / `npm run test --workspaces --if-present` pick it up. Unit tests via `jest`/`ts-jest` (matches `apps/control-server`'s existing setup) against a mocked global `fetch` — cover session persistence across a `HttpClient` instance, the 401-refresh-and-retry-once path, and query-builder URL/body construction per method.
3. **Env file generator** — new admin UI action (API Keys page) that mints a **fresh** secret/service_role key server-side via the existing `ApiKeysService.create()` path (named e.g. `env-export-<timestamp>`, audit-logged as an ordinary `admin.api_key_created` — no new audit event type needed), combines it with the project's already-revealable publishable key (existing `reveal()` path) and a `BAAS_URL` field defaulting to `window.location.origin` (the admin UI is itself served through the same public Caddy entry point, so this needs no new backend plumbing of `PUBLIC_DOMAIN`) into a client-assembled `.env` file offered as a download. The plaintext secret key is never persisted or re-shown after the download, consistent with the existing one-time-reveal design (`api-keys.service.ts`) — existing secret keys are untouched; this always creates a new one rather than trying to surface an old one's plaintext.
4. **Docs — install/deploy guide** — new `docs/install.md`: prerequisites, `docker compose up --env-file .env`, `PUBLIC_DOMAIN` configuration for a real deployment (already documented in `docker-compose.yml`/`Caddyfile` comments — consolidate here rather than duplicate), first-project + first-API-key walkthrough, and a client-sdk quick start mirroring scope.md §15's example.
5. **Upgrade runbook** (originally Phase 6b item 6, bundled into this pass) — new `docs/upgrade.md`: `git pull` + `docker compose up --build` procedure, confirmation of `node-pg-migrate`'s migration-on-boot behavior, a secrets-are-env/mounted-files-only reminder (nothing secret ever lives in the repo), and a rollback note.
   - **Acceptance**: a new HTML page can auth + CRUD against `tasks` with zero backend code using only `@personal-baas/client-sdk` (original Phase 5 acceptance bar, unchanged); `npm run build` and `npm run test` succeed for the `client-sdk` workspace from the repo root; the admin "Generate .env" action downloads a file whose `BAAS_URL`/`BAAS_PUBLISHABLE_KEY`/`BAAS_SERVICE_KEY` work end-to-end (signup/login/CRUD) against a disposable test table; `docs/install.md` and `docs/upgrade.md` are each followable start-to-finish on a clean checkout.

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
   (not one socket per subscription), validated with `zod` (same convention as the HTTP side's
   request-body schemas): client sends `{type: 'subscribe', id, table, filter?}` /
   `{type: 'unsubscribe', id}`; server replies `{type: 'subscribed', id}` /
   `{type: 'unsubscribed', id}` / `{type: 'error', id, message}`. Deliberately no client-supplied
   `schema` field at all (a refinement from the original sketch) — `schema` is always resolved
   server-side from the caller's JWT `projectId` claim via the existing `ProjectsService.getById`
   (already present in the module list ahead of Phase 9 landing), and since a project has exactly
   one schema, there's no legitimate value a client could ever send there; omitting the field
   entirely is simpler than accepting-then-rejecting a value that could only ever be wrong.
   `filter`, if present, is restricted to the single shape `<column>=eq.<value>` (matching
   PostgREST's own `eq` operator spelling from scope.md §15, kept intentionally narrow per the
   "coarse model" framing below) and the column name is validated against
   `information_schema.columns` for that table before being accepted, to reject typos loudly
   instead of silently matching nothing. The grant check itself is new SQL —
   `select has_table_privilege($1, to_regclass(format('%I.%I', $2, $3)), 'SELECT')` — using the
   caller's JWT `role` claim (the shared `authenticated`/`anon`/`service_role`-style role, not a
   per-user role) against the resolved `schema`/`table`. The `to_regclass()` wrapping isn't
   cosmetic: `has_table_privilege` with a bare `'schema.table'` text argument *raises* if the
   relation doesn't exist rather than returning `false` — caught live when a subscribe request
   for a nonexistent table crashed the whole control-server process via an unhandled rejection.
   `to_regclass()` returns `NULL` for a missing relation instead, and
   `has_table_privilege(role, NULL, 'SELECT')` then just returns `NULL`, coerced to `false` by the
   caller — the right answer with no exception in the path. `RealtimeService.subscribe` and
   `RealtimeGateway`'s message dispatch both additionally wrap their DB/handler calls in
   `try/catch` as defense in depth, on the same "one client's request must never crash every
   other connection" principle. This deliberately does **not** re-evaluate RLS per event — a
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
6. ~~**Upgrade runbook**~~ — moved into Phase 5 item 5 (bundled with that phase's other docs deliverables at the user's request); not duplicated here.
7. **Realtime module robustness fixes** — found via a multi-angle code review of Phase 8 immediately after
   it shipped (8 finder angles + 1-vote verify, all four below CONFIRMED against the actual `pg`/`ws`
   library internals, not just the application code); fixed as hardening work rather than deferred,
   since all four are concurrency/resource-leak bugs rather than missing features:
   - **Subscription-id TOCTOU race** (`realtime.service.ts` `subscribe()`) — the duplicate-id check ran
     synchronously but the registry write happened after three `await`s (`ProjectsService.getById`,
     the grant check, the optional column check), so two `subscribe` messages sent back-to-back with the
     same `id` could both pass the check before either wrote to the registry — corrupting it (one
     subscription becomes unreachable via `byClient` while staying permanently registered in `byTable`,
     so its socket keeps receiving events after the client believes it unsubscribed, and the entry leaks
     for the life of the connection). Fixed by reserving the `id` synchronously as the first thing
     `subscribe()` does (before any `await`), so the check-and-reserve is atomic under JS's
     single-threaded execution; the reservation is released if validation subsequently fails.
   - **Leaked Postgres connection on `LISTEN` failure** (`realtime-listener.service.ts` `connect()`) — if
     `client.connect()` succeeded but the following `client.query('LISTEN realtime_changes')` failed with
     a non-fatal Postgres error (confirmed against `pg`'s source: a plain `ErrorResponse` to an in-flight
     query does not close the underlying connection or emit `'error'`/`'end'` on the `Client`), the catch
     block logged and scheduled a reconnect without ever calling `client.end()` on the still-open session,
     and without storing it anywhere `onModuleDestroy` could find it — each recurrence permanently leaked
     one live Postgres connection. Fixed by unconditionally calling
     `await client.end().catch(() => undefined)` in the catch block before scheduling a reconnect,
     regardless of which step failed.
   - **Dropped WebSocket messages during connection auth** (`realtime.gateway.ts` `handleConnection()`) —
     the `'message'` listener was only attached after `await this.jwt.verifyAccessToken(token)` resolved;
     since that's genuine async work (EdDSA verification via `promisify(crypto.verify)` on Node's
     threadpool, not a same-tick microtask) and the underlying `ws` socket is already capable of parsing
     frames into `'message'` events the instant `handleConnection` starts running, a client that sent its
     first message immediately after seeing the connection open could have that frame silently dropped —
     `EventEmitter` does not buffer events for listeners that don't exist yet. Fixed by attaching a
     buffering listener synchronously as the very first thing `handleConnection` does, swapping in the
     real message handler once auth succeeds, and replaying anything that queued up in the meantime (or
     discarding the queue if auth fails, since the socket is closed either way).
   - **Redundant per-subscriber serialization in the fan-out hot path** (`realtime.service.ts`
     `dispatch()`) — `table`/`operation`/`record` are identical for every subscriber matched in one
     `dispatch()` call (they all share the single NOTIFY event being fanned out), but the full event
     object was re-`JSON.stringify`'d inside the per-subscriber loop regardless — redoing potentially
     expensive serialization of the changed row N times per event on a popular table with many
     subscribers, on Node's single event-loop thread. Fixed by stringifying the invariant fields once
     outside the loop and concatenating those pre-serialized JSON fragments with just each subscriber's
     `id` to build their message.

## Phase 10 — Project-scoped storage (retrofit)

Closes an authorization gap in already-shipped code (scope.md §24) — Phase 7 storage predates
Phase 9 multi-project, so buckets are currently global: any project's valid JWT can read/write/
delete any other project's bucket by name. Treat as a priority fix, not a backlog feature.

1. **`project_id` migration** — node-pg-migrate: add `storage.buckets.project_id` nullable,
   backfill every existing row to the default project's id (`ProjectsService.getDefault()`),
   then set `NOT NULL` + FK to `platform.projects`. Drop the existing unique index on `name`,
   add a unique index on `(project_id, name)`.
2. **`StorageRequester` project scoping** — `storage.service.ts`: `StorageRequester` gains
   `projectId: string` on both the `admin` and `app-user` variants. `getBucketOrThrow`/all
   bucket lookups filter by `(projectId, name)` instead of `name` alone.
3. **App-user route project resolution** — `storage-object.controller.ts`'s `requesterFor()`
   reads `user.projectId` (already present on `AppAccessTokenClaims` since Phase 9 #4) into the
   requester — no route/URL shape change for `/storage/v1/object/:bucket/*path`, project
   resolution stays JWT-derived, consistent with every other project-scoped endpoint.
4. **Admin routes gain a project segment** — `/admin/v1/storage/:project/buckets`,
   `/admin/v1/storage/:project/buckets/:bucket/objects[/*path]`, etc. `StorageAdminController`
   resolves `:project` via `ProjectsService` the same way `admin-projects`/SQL console/DB
   explorer already do (Phase 9 #7) before constructing the `{ kind: 'admin', projectId }`
   requester.
5. **Admin UI project selector** — `/admin/storage` gains the same project-selector pattern as
   the SQL console/DB explorer/API-keys pages, defaulting to the seeded default project.
6. **Optional default-bucket-per-project** — `ProjectsService.create()` gains an opt-in flag to
   auto-create one private bucket named after the project slug; off by default, so
   `examples/todo-app`'s existing manual-bucket-creation flow (Phase 7a #2) is unaffected.
7. **Two-project storage isolation verification** — same rigor as Phase 9 #8: two projects, each
   with a same-named private bucket, two real signed-up-and-logged-in users; confirm project A's
   JWT gets 404 (not 403) against project B's identically-named bucket, and vice versa.
   - **Acceptance**: existing single-project flows (todo-app's `todo-attachments`) keep working
     with zero client-side changes after the backfill; a same-named bucket in a second project is
     fully invisible to the first project's JWTs.

## Phase 11 — Static hosting

1. **`hosting` schema migrations** — `hosting.sites` (`id`, `project_id` unique, `created_at`,
   `updated_at`), `hosting.site_files` (`id`, `site_id`, `path`, `size`, `content_type`,
   `deployed_at`), unique `(site_id, path)`, via node-pg-migrate, same convention as
   `storage`/`functions`/`scheduler`.
2. **Deploy module** — new `apps/control-server/src/modules/hosting/`:
   `POST /admin/v1/hosting/:project/deploy` (`AdminSessionGuard`, multipart zip,
   `FileInterceptor`, a size/file-count cap mirroring `STORAGE_MAX_UPLOAD_BYTES`), unzips
   server-side (new dependency, e.g. `unzipper`), streams each entry into MinIO at
   `hosting/<project_id>/<path>`, full-replace of that project's `hosting.site_files` rows in
   one transaction (delete-then-insert, not diffed).
3. **Serve module** — `GET /sites/:project/*path` (public, no guard): resolve project by slug,
   look up `(site_id, normalized path)`, stream from MinIO with stored `content_type`; on miss,
   if the requested path has no file extension, retry against `index.html` (SPA fallback) before
   returning 404.
4. **Caddy routing** — add `handle /sites/*` forwarding to `control-server:3000`, same shape as
   the existing `/storage/*` block.
5. **Admin UI** — new `/admin/hosting` page: per-project card (file count, total size,
   last-deployed timestamp), zip-upload deploy action, "view live site" link to `/sites/:project/`.
   - **Acceptance**: deploy a zip containing `index.html` + JS that calls this same deployment's
     `/rest/v1/*` with no CORS setup anywhere; open `/sites/<slug>/` in a browser and confirm the
     API call succeeds same-origin; hit a client-side SPA route with no matching file and confirm
     it serves `index.html`, while a genuinely missing asset (e.g. `/sites/<slug>/missing.js`)
     still 404s.

## Phase 12 — Functions

Sandbox decision resolved 2026-07-18: a separate `function-runner` sibling process (scope.md
§26 point 5), chosen for OS-process-boundary crash containment over an in-process V8 isolate,
and to avoid reopening the Docker-socket question §23 point 7 already closed by using a fixed
compose service instead of per-invocation containers.

1. **`functions` schema + CRUD** — `functions.functions` (`id`, `project_id`, `name`,
   `code text`, `timeout_ms` default 10000, `created_at`, `updated_at`), unique
   `(project_id, name)`; `functions.invocations` (`id`, `function_id`, `status`, `duration_ms`,
   `error`, `invoked_at`). Admin CRUD API + page (list/create/edit, reusing the SQL editor's
   vendored CodeMirror 6 with a JS/TS mode). No dependency on items 2-4 below — can land first.
2. **`function-runner` service scaffold** — new `apps/function-runner`: a minimal Node.js HTTP
   server (own `Dockerfile`, own `docker-compose.yml` entry — internal Docker network only, no
   host port published, same "only control-server ever talks to this" shape as `minio`), with a
   `/health` endpoint and a `POST /run` endpoint accepting `{ functionId, code, ctx, timeoutMs }`.
   The runner holds **no** database credential and never queries Postgres — it only ever
   executes what one `/run` call hands it (scope.md §26 point 7b is the actual security property
   here, not just a convention).
3. **Worker execution** — `/run` spawns a **fresh `worker_thread` per invocation** (no pooling/
   reuse in v1 — rules out any cross-invocation global-state leakage by construction, per §26
   point 5), evaluates `code` as the invocation contract's default-export handler (§26 point 3)
   inside it, enforces `timeoutMs` via `worker.terminate()` as a second enforcement layer beneath
   control-server's own HTTP-level timeout, and returns `{ status, body, headers }` or a
   structured error.
4. **`ctx.rest` binding** — constructed control-server-side before dispatch (not inside the
   runner): a fetch wrapper pre-bound to this deployment's own `/rest/v1/*`, forwarding the
   invoking caller's JWT unmodified — no raw Postgres credential ever reaches function code.
   Passed as part of `ctx` in the `/run` request body.
5. **Invocation endpoint** — `POST /functions/v1/:name` on control-server,
   `AccessTokenGuard`-authenticated. Resolves the function via
   `functions.functions WHERE project_id = $1 AND name = $2` (never `WHERE name = $2` alone —
   this query is the actual cross-project isolation boundary, scope.md §26 point 7a) before ever
   calling function-runner; a project-A JWT against a project-B function name 404s here, before
   the runner is contacted at all. Proxies to function-runner's `/run` over internal HTTP, writes
   a `functions.invocations` row per call (status/duration/error), returns 503 if the runner is
   unreachable.
6. **Caddy routing** — add `handle /functions/*` forwarding to `control-server:3000` only (not
   directly to `function-runner`, which has no public route at all), same shape as
   `/storage/*`/`/auth/*`.
7. **Test-invoke + history UI** — admin page: JSON body input, response viewer, invocation
   history table reading `functions.invocations`.
   - **Acceptance**: a function reading `ctx.auth.sub` and calling `ctx.rest` returns different
     data for two different users' JWTs, each seeing only what their own JWT could already read
     directly via `/rest/v1/*`; a project-A JWT invoking a project-B function 404s; killing the
     `function-runner` container mid-invocation returns 503 to the caller while control-server's
     own `/health` stays healthy throughout, and the runner recovers via Docker's restart policy.

## Phase 13 — Scheduler

Depends on Phase 12 — a scheduled job's unit of work is a function invocation.

1. **`scheduler` schema** — `scheduler.scheduled_jobs` (`id`, `project_id`, `name`,
   `function_id` references `functions.functions`, `cron_expression`, `enabled`, `next_run_at`,
   `last_run_at`, `last_status`, `created_at`, `updated_at`), unique `(project_id, name)`;
   `scheduler.job_runs` (`id`, `job_id`, `started_at`, `finished_at`, `status`, `error`).
2. **In-process scheduler service** — new `@Global()` module (`OnModuleInit`/`OnModuleDestroy`,
   same lifecycle convention as Realtime's listener), `cron-parser` computes `next_run_at`, a
   single timer loop wakes for the nearest due job, invokes it via Phase 12's execution path
   with `ctx.auth = { sub: null, role: 'service_role' }`, writes a `scheduler.job_runs` row,
   skips a tick if the previous run for that job hasn't finished.
3. **Admin CRUD + run-now** — `/admin/v1/scheduler/:project/jobs` API + `/admin/scheduler/:project`
   page: list/create/edit jobs, enable/disable toggle, a "run now" action bypassing the schedule.
4. **Run history UI** — table reading `scheduler.job_runs` per job.
   - **Acceptance**: a function that inserts a timestamp row via `ctx.rest`, scheduled every
     minute, produces matching `scheduler.job_runs` and function-owned rows unattended over
     several minutes with no invoking JWT; disabling the job stops further runs.

## Phase 14 — Admin UI redesign

Visual/UX pass across every page in `apps/control-server/src/admin-ui` (scope.md §28) — no
schema, route, or auth changes anywhere in this phase. Full redesign, not a triage of the worst
pages: each item below still lands as its own independently reviewable PR.

1. **Design tokens + shared components** — `admin.css`: add `--color-accent`/`--color-accent-hover`
   and switch `.btn-primary`, active `.topnav a`, links, and focus rings onto it; add a shared
   control-height token applied to `.btn`, `input`, `select`, `textarea`; add a `.page-header`
   component (title + optional description left, actions right) and adopt it on every page,
   replacing the bare `<h1>` + separate `.toolbar` div pattern.
2. **Icon set** — a new shared inline-SVG icon partial (copy, edit, delete, save, add, close,
   view, upload, download, refresh, chevron, external-link, search, run, history, warning), each
   usage carrying `aria-label` + `title`. No new npm/CDN dependency. Swap bare-text action
   buttons ("Copy", "Edit", "Delete", "Revoke", "Refresh") across every page's JS-rendered rows
   for icon buttons; keep visible labels on primary actions and add matching icons to them.
3. **Database Explorer redesign** — `database-explorer.hbs`/`.css`/`.js`: sticky schema-name jump
   strip above the accordion; only the first table per schema expanded by default; per-table
   detail reflowed to columns-full-width-on-top + keys/indexes/policies as a responsive
   multi-column card row; read an initial `?schema=` query param on load and scroll/expand to it.
4. **Projects page cross-links** — `projects.js`: project name renders as a link to
   `/admin/api?projectId=<id>`; schema name renders as a link to
   `/admin/database?schema=<schemaName>`. `api-explorer.js`/`database-explorer.js` read those
   query params on load and pre-select accordingly (small addition to each, on top of point 3's
   `?schema=` handling for the DB explorer side).
5. **SQL editor toolbar/layout** — `sql-editor.hbs`/`.css`: regroup the toolbar into
   visually-separated clusters (project | run/cancel | row-limit/snippet/upload | history), icon
   + label buttons with tooltips for run/cancel/history/upload, reusing point 2's icon set.
6. **API Keys / Users secret-panel dismiss fix** — `api-keys.js`, `admin-users.js`: add a close
   button to `#secret-banner` (both pages use the identical pattern) that hides it; auto-hide it
   on project-selector change and whenever a new create/view action fires for a different key or
   user.
7. **Functions CodeMirror editor** — `scripts/build-vendor.mjs`/`vendor-entry.js`: add
   `@codemirror/lang-javascript` and `@codemirror/lang-json`, export `javascript`/`json`
   extensions, rebuild the vendored bundle. `functions.hbs` + `functions.js`: replace the
   function-code `<textarea>` with a CodeMirror instance using the JS/TS mode (same
   `EditorView`/`basicSetup` setup the SQL editor already uses) and the invoke-body `<textarea>`
   with a JSON-mode CodeMirror instance.
8. **Remaining pages pass** — Dashboard, Storage, Hosting, Users, Audit, API Explorer, login,
   landing: adopt points 1-2 (page-header, icon actions, alignment) plus per-page tightening
   (Dashboard KPI/table card styling, Storage/Hosting panel treatment matching the redesigned
   Functions layout, Users/Audit pagination + toolbar alignment).
   - **Acceptance**: every page manually verified in a real browser (no visual regression) —
     this is a UI-only phase, so browser walkthroughs are the verification method, not automated
     UI tests; DB Explorer's `?schema=` deep link correctly scrolls to and expands the target
     schema; Projects page name/schema links land on the correctly pre-filtered API Explorer /
     Database Explorer view; the API Keys secret panel dismisses via its close button and does
     not persist across a project switch; the Functions code and invoke-body editors both show
     real JS/TS and JSON syntax highlighting.

## Phase 15 — Database management actions

Adds three destructive/read actions directly into the Database Explorer's table and function rows
(scope.md §29) — function source viewing, column delete, table delete. No general DDL builder;
create/rename/alter stays the SQL Editor's job. No RBAC change (console has one admin trust level
already, see §29 point 6).

1. **`db-management` backend module** — new `apps/control-server/src/modules/db-management/`
   (controller + service), sibling to `db-explorer`, same `AdminSessionGuard`. Reuses
   `AdminQueryService.withConnection()` for transaction-scoped DDL and `AuthAuditService.record()`
   for `admin.table_deleted`/`admin.column_deleted` audit events, matching the existing
   `admin.*`-prefixed convention (e.g. `admin-users.service.ts`'s `admin.user_created`).
2. **Function source endpoint + viewer** — `GET /admin/v1/database/:schema/functions/:oid/source`
   returns `pg_get_functiondef(oid)`. Explorer's function rows become clickable, opening a
   read-only CodeMirror 6 panel (`EditorState.readOnly.of(true)`, existing vendored
   `sql(PostgreSQL)` mode — no new vendor package). No edit/save controls.
3. **Delete-column** — `GET .../tables/:table/columns/:column/delete-preview` (primary-key flag,
   referencing indexes, dependent views) + `DELETE .../tables/:table/columns/:column`
   (`ALTER TABLE ... DROP COLUMN`, single transaction, blocked server-side if a dependent view
   exists). UI: delete icon per column row, confirm modal, no typed-name requirement.
4. **Delete-table** — `GET .../tables/:table/delete-preview` (row estimate via `pg_class.reltuples`,
   index/policy/trigger counts, dependent views, referencing foreign keys, same-schema function
   text-reference scan per scope.md §29 point 4) + `DELETE .../tables/:table` (`DROP TABLE`, no
   `CASCADE`, single transaction, blockers re-validated server-side before running). UI: delete
   icon per table header, confirm modal requires typing the exact table name before the delete
   button enables; blockers (dependent view / referencing FK) disable delete entirely with the
   specific blocking object named; function references shown as a non-blocking warning list.
   - **Acceptance**: see scope.md §29 acceptance — blockers correctly gate deletion both at
     preview and at execute time, a successful table delete removes indexes/policies/triggers
     atomically with the table and writes one audit row, column delete enforces the narrower
     (view-only) blocker set, the function-source viewer renders real `pg_get_functiondef` output
     with SQL highlighting and no edit affordance.

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
- Phase 5: `client-sdk` unit tests (mocked fetch) via `npm run test --workspaces`; env-file generator and install/upgrade docs verified manually against the live dev stack once built.
- Phase 6: curl over HTTPS + inspect security headers/CORS; consume a password-reset token exactly once; scrape `/metrics`.
- Phase 7: curl-based upload/download/signed-URL flow against the live MinIO container; confirm real data (including the new `storage` schema/volume) survives a rebuild.
- Phase 7a: copy `examples/todo-app/` to a scratch directory, point `config.js` at the running stack, exercise register→login→CRUD→upload→download→delete manually in a browser.
- Phase 8: two real WebSocket connections with different filters, verifying correct fan-out/exclusion — same rigor as the Phase 4.5 two-user RLS verification.
- Phase 9: create a second project, restart PostgREST once, confirm its user/JWT/RLS stack works independently and a cross-project `Accept-Profile` request is rejected at the role/grant level — plus a regression check that the pre-existing project's flows (including `examples/todo-app`) are unaffected.
- Phase 6b: exercise rate limits and backup/restore scripts against the dev stack. (deferred)
- Phase 10: two projects with same-named private buckets, two real users; confirm 404 (not 403) cross-project, plus a regression check that `examples/todo-app`'s storage flow is unaffected by the backfill.
- Phase 11: deploy a zip via the admin console, load it in a browser at `/sites/<slug>/`, confirm same-origin API calls succeed with no CORS config and SPA fallback behaves correctly.
- Phase 12: two real users invoking the same function via their own JWTs see only their own data through `ctx.rest`; cross-project invocation 404s; killing the `function-runner` container mid-invocation returns 503 without affecting control-server's own health.
- Phase 13: a scheduled function's writes and `scheduler.job_runs` both advance unattended; disabling a job stops it.
- Phase 14: manual browser walkthrough of every admin page (no headless/Playwright testing — same convention as every prior admin-UI phase); confirm the DB Explorer `?schema=` deep link, Projects page cross-links, dismissible API Keys secret panel, and Functions CodeMirror editors all behave as designed.
- Phase 15: against a real table with rows/index/policy/a same-schema function referencing it — confirm the delete-table preview's counts and warnings are accurate, blockers (dependent view, referencing FK) actually prevent deletion server-side (not just client-side), a successful delete removes everything atomically with one audit row, and the function-source viewer shows real `pg_get_functiondef` output with no edit affordance.
