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
exposed on:

```
http://localhost:8000   (plain HTTP, dev convenience)
https://localhost:443   (HTTPS — see TLS below)
```

## TLS

Caddy serves HTTPS on `:443` alongside the plain-HTTP `:8000` dev endpoint above. Three ways to run it:

- **Default (no config)** — `PUBLIC_DOMAIN` defaults to `localhost`. Caddy recognizes this isn't
  a publicly-resolvable domain and automatically serves a certificate from its own internal CA.
  Your browser will show a one-time trust warning the first time (self-signed, but a real
  certificate — it works the same as any HTTPS site otherwise, and is stable across restarts
  because Caddy's cert/CA state lives in the `caddy_data` volume).
- **Real domain, automatic Let's Encrypt** — set `PUBLIC_DOMAIN` in `.env` to a real domain that
  resolves to this host, with ports 80 and 443 reachable from the internet, and Caddy
  automatically obtains and renews a trusted Let's Encrypt certificate. No other changes needed.
- **Bring your own certificate** — mount your cert/key files into the `caddy` container (add a
  volume in `docker-compose.yml`) and replace the HTTPS site block's address line in
  `infrastructure/proxy/Caddyfile` with `tls /path/to/cert.pem /path/to/key.pem`.

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
