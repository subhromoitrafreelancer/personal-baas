# Upgrade runbook

This kit upgrades through **images**, not source code. Each release of personal-baas publishes
new tags of the three `personal-baas-*` images; you rebuild/load the new tags, then let Compose
recreate the containers.

## Procedure

1. **Back up first.** There's no built-in backup/restore tooling yet. Take a manual snapshot:
   ```bash
   docker compose -f docker-compose.personal-baas.yml --env-file .env exec postgres \
     pg_dump -U baas_admin "$POSTGRES_DB" > backup-$(date +%Y%m%d).sql
   ```
2. **Get the new images.** Either rebuild from a newer monorepo checkout:
   ```bash
   ./scripts/build-local-images.sh /path/to/personal-baas-monorepo 0.2.0
   ```
   or load the new release's tarballs (`docker load -i ...`) and update the `BAAS_*_IMAGE`
   tags in `.env` to match.
3. **Point `.env` at the new tags** (unless your tarballs/builds reused the same tags):
   ```env
   BAAS_CONTROL_SERVER_IMAGE=personal-baas-control-server:0.2.0
   BAAS_FUNCTION_RUNNER_IMAGE=personal-baas-function-runner:0.2.0
   BAAS_POSTGRES_IMAGE=personal-baas-postgres:0.2.0
   ```
4. **Recreate the stack.** Migrations run automatically: the `control-server-migrate` one-shot
   container runs `npm run migrate:up` against the platform/auth schemas before `control-server`
   is allowed to start, so a plain `up -d` is the whole upgrade:
   ```bash
   docker compose -f docker-compose.personal-baas.yml --env-file .env up -d
   ```
   Then restart PostgREST once so it picks up the recreated config volume state:
   ```bash
   docker compose -f docker-compose.personal-baas.yml --env-file .env restart postgrest
   ```
5. **Verify.**
   ```bash
   curl -sf http://localhost:8000/health
   docker compose -f docker-compose.personal-baas.yml --env-file .env ps
   ```
   All services should report healthy (`postgres`, `postgrest`, `control-server`,
   `function-runner`, `caddy`, `minio`).

If you overlay this kit on your own compose file (`-f docker-compose.yml
-f docker-compose.personal-baas.yml`), repeat the same commands with both `-f` flags.

## What migrations touch (and what they don't)

Only the `platform` and `auth` schemas are managed by `node-pg-migrate` inside the
control-server image. Your own `api`/`api_<slug>`/`private` schema objects (tables, views,
functions, RLS policies created through the SQL editor) are never touched by an upgrade; they're
exclusively developer-driven and have no tooling-managed shape to migrate.

## Secrets

Nothing secret lives in the kit. Every credential (`BAAS_ADMIN_PASSWORD`,
`ADMIN_SESSION_SECRET`, `AUTH_JWT_*`, `INITIAL_ADMIN_PASSWORD`, MinIO root credentials) comes
from `.env` and is passed to containers purely as environment variables — an upgrade never
requires touching a secret's value, and replacing the kit files never overwrites your `.env`.
If you rotate a secret, update `.env` and re-run step 4 to restart the affected services.

## Rollback

If an upgrade goes wrong:

1. Restore the pre-upgrade database snapshot from step 1:
   ```bash
   docker compose -f docker-compose.personal-baas.yml --env-file .env exec -T postgres \
     psql -U baas_admin "$POSTGRES_DB" < backup-YYYYMMDD.sql
   ```
2. Point `BAAS_*_IMAGE` back to the previous tags in `.env`, then recreate:
   ```bash
   docker compose -f docker-compose.personal-baas.yml --env-file .env up -d
   docker compose -f docker-compose.personal-baas.yml --env-file .env restart postgrest
   ```

There is no automated schema-rollback path. `npm run migrate:down` (which exists inside the
control-server image) reverses the most recent `platform`/`auth` migration if you need to unwind
schema changes without a full database restore, but for anything beyond the schema (data
changes, config drift) the snapshot restore above is the reliable path.
