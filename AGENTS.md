# Repository Guidelines

## Project Overview

`personal-baas` is a self-hosted, lightweight Backend-as-a-Service: PostgreSQL + PostgREST + a NestJS control service behind a Caddy reverse proxy. It provides an admin UI/API for projects, SQL/database exploration, auth, API keys, storage, static hosting, functions, realtime, and example client apps.

## Architecture & Data Flow

- Public ingress is Caddy (`infrastructure/proxy/Caddyfile`) on `http://localhost:8000` and `https://{$PUBLIC_DOMAIN}:443`.
  - `/rest/v1/*` is stripped and proxied to PostgREST.
  - `/auth/*`, `/storage/*`, `/sites/*`, `/functions/*`, `/realtime/*`, `/admin*`, and `/health*` go to `apps/control-server`.
- `apps/control-server/src/main.ts` boots Nest, security middleware, CORS for `/auth` and `/storage`, same-origin protection for `/admin`, Handlebars views, static admin assets, and WebSocket support.
- `apps/control-server/src/app.module.ts` is the Nest composition root. Feature folders under `src/modules/*` own controllers, services, repositories, DTO/types, and module wiring.
- PostgreSQL is the source of truth. `packages/database-bootstrap/sql/*` creates base roles/schemas once; `apps/control-server/migrations/*` uses `node-pg-migrate` for platform/auth-managed schema changes.
- Application schemas (`api`, `api_<slug>`) are developer-managed through the SQL editor. PostgREST exposes those schemas and relies on PostgreSQL grants/RLS plus JWT role switching.
- Project creation rewrites the shared PostgREST config volume; new schemas/roles require a manual `docker compose restart postgrest` after creation.
- MinIO stores object bytes. Control-server owns MinIO credentials; clients use `/storage/v1/*`. Logical buckets are metadata/prefixes, not separate MinIO buckets.
- `apps/function-runner` is an internal sidecar with no host port. Control-server sends already-authorized code/context to `/run`; the runner executes each invocation in a fresh worker thread and never talks to Postgres directly.
- `packages/client-sdk` is a small PostgREST-shaped TypeScript SDK: auth/session, query builder, storage, and RPC helpers.

## Key Directories

- `apps/control-server/` — NestJS control service, admin UI, migrations, and vendor-build scripts.
- `apps/control-server/src/modules/` — feature modules: auth, admin-auth, projects, API keys, SQL console/history, DB explorer/management, storage, hosting, functions, realtime, health, metrics.
- `apps/control-server/src/admin-ui/` — server-rendered Handlebars views plus frameworkless page JS/CSS.
- `apps/function-runner/` — isolated Node worker-thread function execution service.
- `packages/client-sdk/` — private ESM SDK built with `tsup`, tested with Jest.
- `packages/database-bootstrap/` — one-time Postgres role/schema/reload-trigger SQL consumed by the Postgres Docker image.
- `packages/shared-types/` — shared TypeScript types package; currently minimal.
- `infrastructure/docker/` — Docker Compose stack and local runtime wiring.
- `infrastructure/postgres/`, `infrastructure/postgrest/`, `infrastructure/proxy/` — Postgres image/init, PostgREST mutable config template, Caddy routing.
- `examples/todo-app/` — zero-build browser example using plain fetch.
- `examples/ats-app/` — Vite/React/Tailwind example using `@personal-baas/client-sdk`.
- `docs/` — install, upgrade, implementation plan, and prior control-server review notes.

## Development Commands

```bash
npm install
npm run dev:control-server
npm run build
npm run lint
npm run format:check
npm run format
npm run test
```

Stack/runtime commands:

```bash
cp .env.example .env
npm run generate:jwt-keys --workspace apps/control-server
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml up --build
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml down
npm run migrate:up
npm run migrate:down
npm run migrate:create
```

Targeted workspace commands:

```bash
npm run build --workspace apps/control-server
npm run start:dev --workspace apps/control-server
npm run test --workspace packages/client-sdk
npm run test --workspace packages/client-sdk -- query-builder.spec.ts
npm run build --workspace packages/client-sdk
npm run dev --workspace examples/ats-app
npm run build --workspace apps/function-runner
```

## Code Conventions & Common Patterns

- TypeScript is strict at the base (`tsconfig.base.json`): ES2022, `strict`, `noImplicitAny`, `strictNullChecks`, `noImplicitReturns`, declarations and source maps. Control-server enables Nest decorators and disables unused checks locally.
- Formatting is Prettier: semicolons, single quotes, trailing commas, 100-column print width, 2-space tabs.
- ESLint uses flat config with `@eslint/js`, `typescript-eslint`, and `eslint-config-prettier`; generated JS/MJS/CJS and `dist` are ignored; unused args should be prefixed with `_`.
- Nest feature pattern: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, plus `*.types.ts`, `*.dto.ts`, `*.queries.ts`, or `*.util.ts` when needed.
- Keep page controllers separate from JSON controllers. Admin pages use `AdminPageAuthFilter`; admin JSON routes use `AdminSessionGuard` and live under `/admin/v1/*` where applicable.
- Validate unknown request bodies near controllers with Zod `safeParse`, then delegate business rules to services.
- Use Nest exceptions for HTTP errors and guards for auth failures. Preserve 404-on-probing patterns where cross-project resource existence should not leak.
- Use constructor injection and module exports for dependencies. Shared infrastructure providers use symbols such as `PG_POOL`, `ADMIN_QUERY_POOL`, and `MINIO_CLIENT`.
- Keep privileged operations in control-server repositories/services. SQL values should use bind parameters; interpolate identifiers only after explicit validation/invariants are documented.
- Transactions use explicit `BEGIN`/`COMMIT`/`ROLLBACK` with `finally` release.
- Admin UI JS is frameworkless; escape HTML before `innerHTML`, use local `apiFetch` wrappers, redirect 401s to `/admin/login`, and keep destructive actions explicit.
- SDK code should stay small and PostgREST-oriented rather than growing a Supabase-compatible abstraction layer.
- Security/runtime comments are intentional. Preserve or update them when changing auth, CORS, CSRF, storage limits, project provisioning, function execution, or PostgREST config behavior.

## Important Files

- `package.json` — npm workspaces, Node engine, root scripts.
- `package-lock.json` — npm lockfile; use npm, not another package manager.
- `.env.example` — only copyable env template; never copy values from local `.env` files into docs or code.
- `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json` — shared tooling rules.
- `apps/control-server/src/main.ts` — HTTP/Nest bootstrap, middleware, admin UI serving.
- `apps/control-server/src/app.module.ts` — module composition.
- `apps/control-server/src/config/env.schema.ts` — runtime environment contract and defaults.
- `apps/control-server/src/modules/database/database.module.ts` — internal PG pool provider.
- `apps/control-server/src/modules/admin-db/admin-query.service.ts` — admin SQL execution/cancel primitive.
- `apps/control-server/src/modules/projects/projects.service.ts` — project/schema/role orchestration and PostgREST config rewrite.
- `apps/control-server/migrations/` — platform/auth migrations.
- `apps/function-runner/src/main.ts`, `apps/function-runner/src/worker-entry.ts` — function invocation runtime.
- `packages/client-sdk/src/client.ts`, `http.ts`, `query-builder.ts`, `auth.ts`, `storage.ts` — SDK public behavior.
- `packages/client-sdk/jest.config.cjs` and `packages/client-sdk/test/*.spec.ts` — active test setup.
- `infrastructure/docker/docker-compose.yml` — authoritative service topology.
- `infrastructure/postgrest/postgrest.conf.template` — seed for mutable PostgREST schema config.
- `infrastructure/proxy/Caddyfile` — public routing table.

## Runtime/Tooling Preferences

- Required runtime: Node.js `>=22.0.0`.
- Package manager: npm workspaces with `package-lock.json` lockfile version 3. No `packageManager` field is set; stay with npm unless explicitly asked.
- Full stack requires Docker and Docker Compose.
- The compose file is nested, so always pass `--env-file .env -f infrastructure/docker/docker-compose.yml` from the repo root.
- Control-server is NestJS 11 + CommonJS output. SDK and ATS example are ESM/bundler-oriented.
- Build tools: Nest CLI for control-server, `tsc` for function-runner, `tsup` for SDK, Vite for `examples/ats-app`.
- `apps/control-server/scripts/build-vendor.mjs` vendors CodeMirror into admin static assets before Nest build.
- Secrets and generated keys belong in `.env`/mounted config only. Use `apps/control-server/scripts/generate-jwt-keypair.mjs` through the npm script for JWT key material.

## Testing & QA

- Active tests are Jest 29 + `ts-jest` in `packages/client-sdk/test/*.spec.ts`.
- Root `npm test` runs workspace `test` scripts with `--if-present`.
- SDK tests use inline helpers/mocks (`globalThis.fetch = jest.fn()`, local `MemoryStorage`, direct `Response` objects) instead of shared fixture directories.
- Useful commands:

```bash
npm run test
npm run test --workspace packages/client-sdk
npm run test --workspace packages/client-sdk -- http.spec.ts
npm run test --workspace apps/control-server
npm run test:e2e --workspace apps/control-server
```

- `apps/control-server` declares Jest and an e2e script, but no `apps/control-server/test/` directory or `test/jest-e2e.json` was observed; verify or add that setup before relying on the e2e command.
- No first-party coverage thresholds or CI workflow files were observed. For behavioral changes, run the narrowest relevant workspace test/build and, for stack changes, smoke-test the Docker path and `/health`/`/health/ready` endpoints when services are available.
