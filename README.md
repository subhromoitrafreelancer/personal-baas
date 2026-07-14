# personal-baas

Self-hosted, lightweight Backend-as-a-Service: PostgreSQL + PostgREST + a NestJS control
service (SQL editor, database explorer, auth, API configuration) behind a single reverse-proxy
entry point.

See [`scope.md`](./scope.md) for the full product/architecture spec and
[`docs/implementation-plan.md`](./docs/implementation-plan.md) for the phased build plan.

## Quick start

```bash
cp .env.example .env
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml up --build
```

(the `--env-file` flag is required because `docker-compose.yml` lives in `infrastructure/docker/`,
not the repo root, so Compose won't discover `.env` on its own)

This starts PostgreSQL, PostgREST, the NestJS control service, and the Caddy reverse proxy,
exposed on a single port:

```
http://localhost:8000
```

## Repository layout

```
apps/control-server/        NestJS control service: admin API + admin UI + auth + rest config
packages/client-sdk/        TypeScript client SDK (Phase 5)
packages/shared-types/      Types shared across apps/packages
packages/database-bootstrap/ One-time role/schema init SQL (platform/auth/api/private)
infrastructure/docker/      docker-compose.yml, Dockerfiles
infrastructure/postgres/    Postgres init wiring, event-trigger SQL
infrastructure/postgrest/   postgrest.conf template
infrastructure/proxy/       Caddyfile
examples/                   Sample frontend apps using the SDK
docs/                       Guides and the implementation plan
```

## Development

This is an npm-workspaces monorepo (Node.js >= 22).

```bash
npm install
npm run dev:control-server
```
