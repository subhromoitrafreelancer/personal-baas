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
│   └── html-todo-app/
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
7. **Sample app** — `examples/html-todo-app`: plain HTML/vanilla JS app using the SDK against `api.tasks`.
8. **Docs** — install/deploy guide in `docs/`.
   - **Acceptance**: a new HTML page can auth + CRUD against `tasks` with zero backend code.

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

1. **MinIO service + bootstrap** — new `minio` service in `docker-compose.yml` (own named volume, root credentials via env, no unnecessary host port exposure), single bucket auto-created at bootstrap (mirrors `database-bootstrap`'s role/schema init pattern).
2. **`storage` schema migrations** — `storage.buckets` (id, name, public boolean, size_limit_bytes, created_at) and `storage.objects` (id, bucket_id, path, owner user id, size, content_type, created_at) via `node-pg-migrate`, same convention as `platform`/`auth`.
3. **Storage API module** — new control-server module, `POST/GET/DELETE /storage/v1/object/:bucket/*path`, authenticated via the existing app-user JWT; checks caller permission against `storage.buckets`/`storage.objects` (owner-based + public-bucket-read) before streaming to/from MinIO using a service credential never exposed to browsers.
4. **Signed URLs** — `POST /storage/v1/object/sign/:bucket/*path`, short-lived presigned MinIO URL, permission-checked at signing time only.
5. **Size limits** — per-upload cap enforced in the storage module (mirrors the existing SQL-file-upload size-cap precedent), configurable via env.
6. **Admin UI** — new `/admin/storage` page (bucket list, object browser, manual upload/download for testing), following the existing page-controller + `{{> topbar}}`/`{{> footer}}` partial pattern.
   - **Acceptance**: create a bucket, upload an object with an authenticated JWT, download it back, confirm a non-owner/non-public request is rejected, confirm a signed URL works without the caller's own JWT.

## Phase 8 — Realtime (optional)

Table subscriptions (§22 in `scope.md`). Promoted from scope.md's "Later Roadmap," explicitly
lower priority than Phase 7. Uses triggers + `LISTEN`/`NOTIFY` (the same primitive Phase 2 #2/#3
already use for `NOTIFY pgrst` schema-reload), not full logical replication — avoids a new
Postgres role, a `wal_level=logical` config change, and replication-slot management for a
feature marked optional. GraphQL is not required and not used (PostgREST cannot support
subscriptions itself; realtime always needs a sibling WebSocket service regardless of GraphQL).

1. **Trigger infrastructure** — reusable `platform.notify_realtime_change()` trigger function (mirrors `platform.notify_pgrst_reload_schema()` in `packages/database-bootstrap`), attachable per-table via a helper offered alongside the RLS snippet library in the SQL editor.
2. **WebSocket gateway** — new control-server module using `@nestjs/websockets`, `wss://.../realtime/v1` routed through Caddy, authenticated via the existing `AuthJwtService.verifyAccessToken`.
3. **Subscription authorization** — on subscribe, check the caller's role has REST `SELECT` grant on the requested table; accept an optional equality filter clause (coarse model, not per-event RLS re-evaluation).
4. **Event fan-out** — single persistent `LISTEN` connection (via `pg`, already a control-server dependency), parses each NOTIFY payload, matches against each subscriber's table + filter, delivers over WebSocket.
5. **Admin UI (minimal)** — active-connections/subscriptions KPI card on the dashboard (reuses the existing KPI card pattern); a full realtime admin page is deferred.
   - **Acceptance**: two WebSocket clients subscribe to the same table with different `user_id=eq.<uuid>` filters; an insert/update/delete from a third connection delivers only to the correctly-filtered subscriber(s).

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
- Phase 5: run `examples/html-todo-app` in a browser against the running stack. (deferred)
- Phase 6: curl over HTTPS + inspect security headers/CORS; consume a password-reset token exactly once; scrape `/metrics`.
- Phase 7: curl-based upload/download/signed-URL flow against the live MinIO container; confirm real data (including the new `storage` schema/volume) survives a rebuild.
- Phase 8: two real WebSocket connections with different filters, verifying correct fan-out/exclusion — same rigor as the Phase 4.5 two-user RLS verification.
- Phase 6b: exercise rate limits and backup/restore scripts against the dev stack. (deferred)
