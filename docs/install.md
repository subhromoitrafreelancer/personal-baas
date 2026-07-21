# Install & deploy guide

A from-scratch walkthrough: bring the stack up, log into the admin console, create a project and
its first API keys, and connect a client app — either with `@personal-baas/client-sdk` or plain
`fetch`. For the architecture behind each piece, see [`scope.md`](../scope.md); for what shipped
in which phase, see [`implementation-plan.md`](./implementation-plan.md).

## Prerequisites

- Docker and Docker Compose
- Node.js >= 22 and npm (only needed if you're building the client SDK or running the control
  server outside Docker for development — not required just to run the stack)

## 1. Bring up the stack

```bash
cp .env.example .env
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml up --build
```

`--env-file .env` is required because `docker-compose.yml` lives in `infrastructure/docker/`, not
the repo root, so Compose won't discover `.env` on its own.

This starts Postgres, PostgREST, the NestJS control service, MinIO, the function-runner sidecar,
and the Caddy reverse proxy. Everything goes through Caddy — no other port needs to be reachable
from outside the host:

```
http://localhost:8000   plain HTTP, dev convenience
https://localhost:443   HTTPS (self-signed by default — see "Going to production" below)
```

Migrations run automatically as a one-shot `control-server-migrate` container before
`control-server` starts (gated by `depends_on: condition: service_completed_successfully` in
`docker-compose.yml`) — there's no separate manual migration step on first boot.

## 2. First admin login

`.env.example` ships with `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` placeholders. On first
boot, if no platform administrator exists yet, the control server creates one from those two
values automatically. Set real values in `.env` before the first `up`, then sign in at
`http://localhost:8000/admin/login`.

## 3. Create a project

A "Default Project" (`api` schema, `anon`/`authenticated`/`service_role` roles) already exists out
of the box — you can start using it immediately, or create additional isolated projects from
`/admin/projects`. Each project gets its own `api_<slug>` schema and
`anon_<slug>`/`authenticated_<slug>`/`service_role_<slug>` Postgres roles, so tables/RLS policies
in one project are invisible to another. Creating a project requires one manual
`docker compose restart postgrest` afterwards so PostgREST picks up the new schema/roles — the
admin UI tells you this at the end of the create flow.

## 4. Create your first table and API keys

1. Open `/admin/database` (SQL editor) and create a table in the project's schema, e.g.:
   ```sql
   create table tasks (
     id uuid primary key default gen_random_uuid(),
     title text not null,
     completed boolean not null default false,
     created_at timestamptz not null default now()
   );
   ```
   It's live at `/rest/v1/tasks` immediately — no restart needed for table changes, only for
   creating a whole new project.
2. Open `/admin/api-keys`, select the project, and click **Create key** to make a publishable key
   (safe to ship to a browser) and/or a secret key (server-only, bypasses RLS — never expose it to
   a browser). Secret keys are shown once at creation time and can't be viewed again; publishable
   keys can be re-viewed anytime.
3. Or click **Generate .env** on that same page to skip steps above — it mints a fresh secret key,
   reuses (or creates) a publishable key, and downloads a ready-to-use `.env`:
   ```env
   BAAS_URL=https://your-deployment.example.com
   BAAS_PUBLISHABLE_KEY=...
   BAAS_SERVICE_KEY=...
   ```
   The secret key inside that file is not stored anywhere else and won't be shown again — treat
   the downloaded file itself as the one copy.

## 5. Connect a client

### With `@personal-baas/client-sdk`

```bash
npm run build --workspace packages/client-sdk
```

```typescript
import { createClient } from '@personal-baas/client-sdk';

const client = createClient({
  url: 'https://your-deployment.example.com',
  apiKey: 'publishable-key',
});

await client.auth.signIn('user@example.com', 'password');

const { data } = await client
  .from('tasks')
  .select('*')
  .eq('completed', false)
  .order('created_at', { ascending: false })
  .limit(20);
```

The SDK is workspace-internal (not published to npm) — a consumer outside this monorepo would
copy `packages/client-sdk/dist/` after running the build above.

### Without the SDK (plain `fetch`)

Auth and REST are both plain HTTP underneath — see `examples/todo-app` for a complete
zero-build-step reference client that talks to `/auth/v1/*` and `/rest/v1/*` directly.

## Going to production

The one thing that actually needs to change for a real deployment is `PUBLIC_DOMAIN` in `.env`:

- **Default (`PUBLIC_DOMAIN=localhost`)** — Caddy serves a self-signed cert from its own internal
  CA; fine for local dev, not for a public deployment.
- **Real DNS-resolvable domain** — set `PUBLIC_DOMAIN` to it, with ports 80/443 reachable from the
  internet, and Caddy automatically obtains and renews a real Let's Encrypt certificate. No other
  config changes.
- **Bare IP address (no domain)** — Let's Encrypt can't issue a certificate for a bare IP. Mount
  your own cert/key into the `caddy` container and replace the HTTPS site block's address line in
  `infrastructure/proxy/Caddyfile` with `tls /path/to/cert.pem /path/to/key.pem`.

Everything else — service-to-service URLs (`postgrest`, `minio`, `function-runner`), Docker
healthchecks (`127.0.0.1`, deliberately, container-local) — already uses Docker Compose service
names or container-local loopback and needs no changes between a laptop and a real AWS/GCP host
running the same `docker-compose.yml`.

Secrets (`BAAS_ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `AUTH_JWT_*_KEY_BASE64`, etc.) come only
from `.env`/mounted files, never from anything checked into the repo — see
[`upgrade.md`](./upgrade.md) for the same rule applied to upgrades.
