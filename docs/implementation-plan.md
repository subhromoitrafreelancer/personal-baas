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

1. **Auth schema migrations** — `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `auth.password_reset_tokens`, `auth.audit_events` (node-pg-migrate, per §7).
2. **Argon2id hashing + signup** — `POST /auth/v1/signup`.
3. **Login + session/token issuance** — `POST /auth/v1/login`: verify password, create `auth.sessions` row, issue Ed25519-signed access JWT (§8 claims) + opaque refresh token (stored hashed).
4. **JWT signing module** — Ed25519 keypair loading (env/mounted files), 15-min access-token lifetime.
5. **Refresh + rotation** — `POST /auth/v1/token`: refresh-token rotation with `family_id`/`parent_token_id` reuse detection.
6. **User self-service** — `GET /auth/v1/user`, change-password, `POST /auth/v1/logout` (session revocation).
7. **Admin user management** — `admin/v1/users` API + page: list/search, create, disable/enable, admin-generated reset link or temp password.
8. **Auth audit trail** — write to `auth.audit_events` on signup/login/logout/password-change/revoke; audit list page.
   - **Acceptance**: register → login → call `/rest/v1/tasks` with the JWT → refresh → revoke session → further refresh fails.

## Phase 4 — Database authorization & RLS integration

1. **Role + grants migration** — `authenticator`/`anon`/`authenticated`/`service_role` per §9, `authenticator` configured as PostgREST's login/role-switch role.
2. **JWT ↔ PostgREST integration** — PostgREST configured with the auth service's public key; verify `request.jwt.claim.*` is visible inside Postgres.
3. **RLS snippet library** — reusable SQL templates (owner-only, public-read/auth-write, admin-only, authenticated CRUD) selectable from the SQL editor.
4. **Exposure warnings** — object explorer flags `api` tables lacking RLS or policies.
5. **API key management** — publishable (`anon`) + secret (`service_role`) keys as signed JWTs with `kid` + rotation; `admin/v1/api-keys` API + page.
6. **RLS verification** — two test users each see only their own `api.tasks` rows through the same endpoint (manual/scripted check).

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

1. **TLS** — Caddy auto-HTTPS or provided certs, docs.
2. **Key rotation** — JWT signing-key rotation with `kid`-based verification; complete API-key rotation flow.
3. **Backup/restore** — `pg_dump`/`pg_restore` wrapper scripts + docs.
4. **Rate limiting & body limits** — NestJS throttler on `/auth`/`/admin`, PostgREST `max-rows`, request body size caps.
5. **Brute-force protection** — login attempt throttling/lockout per email + IP.
6. **Password-reset self-service** — token-consumption endpoint completing the flow started in Phase 3 (still no outbound email).
7. **Security headers + CORS** — `helmet`, CORS policy.
8. **Audit export** — CSV/JSON export of `auth.audit_events` and admin SQL history.
9. **Metrics + healthchecks** — `prom-client` metrics endpoint, container healthchecks in compose.
10. **Upgrade runbook** — docs covering upgrade procedure and secrets handling (env/mounted files only).

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
- Phase 5: run `examples/html-todo-app` in a browser against the running stack.
- Phase 6: exercise rate limits, TLS, and backup/restore scripts against the dev stack.
