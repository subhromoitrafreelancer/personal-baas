# Distribution Recommendation

## Context

Personal-baas should be distributed to other developers as a self-hosted platform without sharing the monorepo source. The goal is convenience and repo privacy, not strong IP protection. No license server or hosted control plane is required.

## Recommendation

Distribute **versioned Docker images plus a small integration kit**.

Do not distribute zip files of binaries as the primary path. This project is already service-oriented, and Docker Compose is the natural integration surface.

## Images to Publish

Publish private or public OCI images such as:

```text
ghcr.io/your-org/personal-baas-control-server:0.1.0
ghcr.io/your-org/personal-baas-function-runner:0.1.0
ghcr.io/your-org/personal-baas-postgres:0.1.0
```

Use upstream images directly where possible:

```text
postgrest/postgrest:v12.2.3
minio/minio
minio/mc
caddy:2-alpine
```

Optionally publish a proxy image if you do not want users editing or mounting the Caddyfile:

```text
ghcr.io/your-org/personal-baas-proxy:0.1.0
```

## Integration Kit to Give Developers

Give developers a small package or repo containing only:

```text
docker-compose.personal-baas.yml
.env.example
README.md
upgrade.md
```

This kit should reference your published images. It should not include application source, internal source files, or the full monorepo.

## Compose Integration Model

Prefer a compose overlay so users can keep their own app compose file:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.personal-baas.yml \
  --env-file .env \
  up -d
```

Their app services should join the same Docker network and call the platform through Caddy or the SDK.

Example shape:

```yaml
services:
  my-app:
    image: their-app:latest
    environment:
      BAAS_URL: http://caddy:8000
      BAAS_PUBLISHABLE_KEY: ${BAAS_PUBLISHABLE_KEY}
    depends_on:
      - caddy
    networks:
      - appnet

  control-server:
    image: ghcr.io/your-org/personal-baas-control-server:0.1.0
    networks:
      - appnet

  function-runner:
    image: ghcr.io/your-org/personal-baas-function-runner:0.1.0
    networks:
      - appnet

  postgres:
    image: ghcr.io/your-org/personal-baas-postgres:0.1.0
    networks:
      - appnet

  postgrest:
    image: postgrest/postgrest:v12.2.3
    networks:
      - appnet

  minio:
    image: minio/minio:RELEASE.2024-11-07T00-52-20Z
    networks:
      - appnet

  caddy:
    image: caddy:2-alpine
    networks:
      - appnet

networks:
  appnet:
```

## What Each Image Should Contain

### control-server

Embed only runtime/build output and files required to run or migrate:

```text
dist/
migrations/
admin-ui assets
runtime package dependencies
```

Expose configuration through environment variables:

```text
PORT
DATABASE_URL
ADMIN_SESSION_SECRET
AUTH_JWT_PRIVATE_KEY_BASE64
AUTH_JWT_PUBLIC_KEY_BASE64
POSTGREST_URL
POSTGREST_CONFIG_PATH
MINIO_ENDPOINT
MINIO_PORT
MINIO_USE_SSL
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
MINIO_BUCKET
FUNCTION_RUNNER_URL
```

### function-runner

Embed:

```text
dist/
runtime package dependencies
```

Expose:

```text
PORT
POSTGREST_URL
```

### postgres

Build from `postgres:16-alpine` and embed only bootstrap assets:

```text
packages/database-bootstrap/sql/*
infrastructure/postgres/init/00-bootstrap.sh
```

This lets users initialize the required roles/schemas without receiving the repo.

## Migrations and Upgrades

Keep the existing migration-container pattern.

Typical upgrade flow:

```bash
docker compose pull
docker compose run --rm control-server-migrate
docker compose up -d
docker compose restart postgrest
```

Use immutable version tags:

```text
0.1.0
0.1.1
0.2.0
```

Avoid telling users to depend on `latest`.

## Client SDK Distribution

If users need `@personal-baas/client-sdk`, distribute it separately from the monorepo.

Best option:

```text
private npm package
```

Acceptable alternatives:

```text
npm pack tarball
compiled dist/ plus .d.ts files
```

Do not give users the whole workspace just to consume the SDK.

## Important Caveat

Docker images are not strong IP protection. A motivated user can inspect image layers and read bundled JavaScript from Node/Nest services.

For this use case, that is acceptable because the stated goal is convenience and avoiding full source distribution, not strong reverse-engineering resistance.

## Final Direction

Use this distribution shape:

1. Publish versioned Docker images for control-server, function-runner, and postgres-bootstrap.
2. Provide a small compose overlay and `.env.example`.
3. Let developers attach their own services to the same Docker network.
4. Publish the SDK separately as a private npm package or packed tarball.
5. Keep the monorepo private.
