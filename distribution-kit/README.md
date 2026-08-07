# personal-baas distribution kit

A small, self-contained way to run **personal-baas** — a self-hosted Backend-as-a-Service
(PostgreSQL + PostgREST + a NestJS control service behind a Caddy reverse proxy) — inside your
own local project, **without the monorepo source**.

This kit is just:

```
docker-compose.personal-baas.yml   the whole platform as pre-built images
                                  (Caddyfile + PostgREST template embedded inside it)
.env.example                       every setting the platform reads
scripts/generate-jwt-keys.mjs      one-time JWT keypair generator
scripts/build-local-images.sh      builds/tags images from a local monorepo checkout
upgrade.md                         how to bump the platform later
```

Everything the platform needs to run is embedded in the compose file itself — there are no other
files to copy or paths to resolve, so the kit works no matter which directory you run it from.

The three personal-baas images must already exist locally — see [Getting the images](#getting-the-images).

## Prerequisites

- Docker and Docker Compose
- Node.js >= 22 (only needed to run `scripts/generate-jwt-keys.mjs` once)

## Getting the images

The compose overlay references three images by tag (`personal-baas-*:0.1.0` by default). They
are **not** on Docker Hub; you must build or load them yourself. Everything else (PostgREST,
MinIO, Caddy, busybox) is pulled from Docker Hub automatically.

### Option A — build from a local monorepo checkout (recommended)

If you have the source repo locally (even if you won't distribute it), build and tag the images:

```bash
./scripts/build-local-images.sh /path/to/personal-baas-monorepo 0.1.0
```

This runs `docker build` with the repo root as context (the Dockerfiles need the npm-workspace
layout) and tags the images the overlay expects.

### Option B — load from image tarballs

If you received the images as `.tar` files (e.g. `docker save` output), load each one:

```bash
docker load -i personal-baas-control-server.tar
docker load -i personal-baas-function-runner.tar
docker load -i personal-baas-postgres.tar
```

The loaded images must carry the tags in `BAAS_*_IMAGE` (defaults to `personal-baas-*:0.1.0`).
If your tarballs use different tags, either `docker tag` them or change `BAAS_*_IMAGE` in `.env`.

## Quick start

```bash
cp .env.example .env
node scripts/generate-jwt-keys.mjs   # paste the three AUTH_JWT_* lines into .env
# fill in every other change_me_* secret in .env
docker compose -f docker-compose.personal-baas.yml --env-file .env up -d
```

> `--env-file .env` is required because the compose file doesn't live at the directory Compose
> would auto-discover `.env` in when the kit is dropped into another project.

Wait for services to be healthy, then:

- **Admin console:** `http://localhost:8000/admin/login` — sign in with `INITIAL_ADMIN_EMAIL` /
  `INITIAL_ADMIN_PASSWORD` from `.env` (used once on first boot).
- **PostgREST API:** `http://localhost:8000/rest/v1/*`
- **Auth API:** `http://localhost:8000/auth/v1/*`
- **Storage API:** `http://localhost:8000/storage/v1/*`
- **HTTPS:** `https://localhost:443` (self-signed by default — see [TLS](#tls))

There's already a "Default Project" (`api` schema, `anon`/`authenticated`/`service_role` roles)
out of the box, so you can start using `/rest/v1` immediately.

## Using it from your own app

### Option 1 — overlay on your app's compose file (recommended)

Keep your own `docker-compose.yml` and add this kit's file on top, so your app services join the
same Docker network and reach the platform through Caddy:

```bash
docker compose -f docker-compose.yml -f docker-compose.personal-baas.yml --env-file .env up -d
```

Your app service just joins the shared network:

```yaml
services:
  my-app:
    image: your-app:latest
    environment:
      BAAS_URL: http://caddy:8000
      BAAS_PUBLISHABLE_KEY: ${BAAS_PUBLISHABLE_KEY}
    depends_on:
      - caddy
    networks:
      - appnet   # declared by docker-compose.personal-baas.yml
```

### Option 2 — separate compose projects

Run the platform standalone (as in [Quick start](#quick-start)), then in a *different* compose
project join the same external network. The network is named `{your-platform-project}-baas-net`
by default (the compose project name the platform runs under). If you want a stable name
independent of that, set `BAAS_NETWORK_NAME` in the platform's `.env` and reference it here:

```yaml
services:
  my-app:
    image: your-app:latest
    environment:
      BAAS_URL: http://caddy:8000
    networks:
      - baas-net

networks:
  baas-net:
    external: true
    name: personal-baas-baas-net   # or your BAAS_NETWORK_NAME value
```

> The network only exists once the platform project is `up` — bring the platform up first.
> The default project-scoped name (`{project}-baas-net`) deliberately keeps one stack from
> interfering with another on the same host.

### Talking to the API

Both routes are plain HTTP, so you can use `@personal-baas/client-sdk` (distributed separately,
not part of this kit) or plain `fetch`:

```bash
# sign in
curl -s http://localhost:8000/auth/v1/sign-in \
  -H 'content-type: application/json' \
  -d '{"email":"user@example.com","password":"..."}'

# authenticated read through PostgREST (publishable key + access token)
curl -s http://localhost:8000/rest/v1/tasks \
  -H "apikey: $PUBLISHABLE_KEY" \
  -H "authorization: Bearer $ACCESS_TOKEN"
```

Create your first table in the admin console at `/admin/database`, then mint API keys at
`/admin/api-keys` (the **Generate .env** button there produces a ready-to-use
`BAAS_URL`/`BAAS_PUBLISHABLE_KEY`/`BAAS_SERVICE_KEY` block).

## Configuration reference

| Variable | Meaning |
| --- | --- |
| `BAAS_CONTROL_SERVER_IMAGE` | control-server image tag (default `personal-baas-control-server:0.1.0`) |
| `BAAS_FUNCTION_RUNNER_IMAGE` | function-runner image tag (default `personal-baas-function-runner:0.1.0`) |
| `BAAS_POSTGRES_IMAGE` | postgres bootstrap image tag (default `personal-baas-postgres:0.1.0`) |
| `BAAS_NETWORK_NAME` | Docker network your app joins (default `{compose-project}-baas-net`) |
| `CONTROL_SERVER_HOST_PORT` | host port for direct control-server access (default `3000`) |
| `POSTGRES_USER/PASSWORD/DB` | Postgres superuser bootstrap (container init only) |
| `BAAS_ADMIN_PASSWORD` | `baas_admin` role password (control-server DB user) |
| `AUTHENTICATOR_PASSWORD` | `authenticator` role password (PostgREST DB user) |
| `ADMIN_SESSION_SECRET` | signs admin console session cookie, >= 32 chars |
| `INITIAL_ADMIN_EMAIL/PASSWORD` | first platform admin, used once on first boot |
| `AUTH_JWT_PRIVATE_KEY_BASE64` | Ed25519 private key (PEM, base64) signing app user tokens |
| `AUTH_JWT_PUBLIC_KEY_BASE64` | matching public key (PEM, base64) |
| `AUTH_JWT_PUBLIC_KEY_JWK` | same public key as a JWK — consumed by PostgREST's `PGRST_JWT_SECRET` |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS` | app-user access token lifetime (default 900) |
| `AUTH_REFRESH_TOKEN_TTL_DAYS` | app-user refresh token lifetime (default 30) |
| `MINIO_ROOT_USER/PASSWORD` | MinIO credentials, held only by control-server |
| `MINIO_BUCKET` | the single real MinIO bucket (default `baas-storage`) |
| `PUBLIC_DOMAIN` | `localhost` (self-signed) or a real domain for Let's Encrypt |

The compose file also wires `NODE_ENV`/`LOG_LEVEL` and internal service URLs
(`postgrest`, `minio`, `function-runner`) which only matter between containers and normally
shouldn't be touched.

## Published ports

- `8000` — Caddy plain HTTP (everything public goes here)
- `80`/`443` — Caddy HTTPS (self-signed or Let's Encrypt)
- `3000` — control-server directly (convenience; set `CONTROL_SERVER_HOST_PORT` if 3000 is taken,
  or remove the `ports:` block in the overlay if you want it host-unreachable)

Postgres, MinIO, PostgREST, and function-runner publish **no** host ports — they're only
reachable inside the Docker network. To back up the database, see `upgrade.md`.

## TLS

- **Default (`PUBLIC_DOMAIN=localhost`)** — Caddy serves HTTPS with a self-signed cert from its
  own internal CA; browsers show a one-time trust warning.
- **Real DNS-resolvable domain** — set `PUBLIC_DOMAIN` to it with ports 80/443 reachable, and
  Caddy automatically obtains/renews a real Let's Encrypt cert. No other config changes.
- **Bare IP or your own cert** — Let's Encrypt can't issue for a bare IP; mount your own
  cert/key into the `caddy` service and change the `:443` site block's address line in the
  `caddy_file` config embedded at the top of `docker-compose.personal-baas.yml` to
  `tls /path/to/cert.pem /path/to/key.pem`.

## Admin console after first boot

`INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` are only used once, when no platform admin exists
yet. After the first admin is created you can blank them in `.env`; sign in stays at
`/admin/login`.

## Caveats

- **Creating a new project** (a new `api_<slug>` schema) requires a manual
  `docker compose -f docker-compose.personal-baas.yml restart postgrest` afterwards so PostgREST
  picks up the new schema/roles. The admin UI prompts you at the end of the create flow. Table
  changes inside an existing schema need no restart.
- **Docker images are not strong IP protection** — image layers can be inspected and the bundled
  JavaScript read. This kit is for convenience and avoiding full source distribution, not for
  reverse-engineering resistance.
- **Nothing secret lives in this kit** — every credential comes from `.env`, never from a
  checked-in file. Don't commit your `.env`.

## Upgrading

See [upgrade.md](./upgrade.md).
