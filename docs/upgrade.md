# Upgrade runbook

## Procedure

1. **Back up first.** There's no built-in backup/restore tooling yet (deferred — see Phase 6b item
   2 in [`implementation-plan.md`](./implementation-plan.md)). Take a manual snapshot before
   upgrading:
   ```bash
   docker compose --env-file .env -f infrastructure/docker/docker-compose.yml exec postgres \
     pg_dump -U baas_admin "$POSTGRES_DB" > backup-$(date +%Y%m%d).sql
   ```
2. **Pull the new code.**
   ```bash
   git pull
   ```
3. **Rebuild and restart.**
   ```bash
   docker compose --env-file .env -f infrastructure/docker/docker-compose.yml up --build -d
   ```
   Compose recreates only the images/containers whose build context actually changed. Migrations
   run automatically: the `control-server-migrate` one-shot container runs `npm run migrate:up`
   against `platform`/`auth` before `control-server` is allowed to start (`depends_on: condition:
   service_completed_successfully` in `docker-compose.yml`) — there is no separate manual
   migration step.
4. **Verify.**
   ```bash
   curl -sf http://localhost:8000/health
   docker compose --env-file .env -f infrastructure/docker/docker-compose.yml ps
   ```
   All services should report healthy (`postgres`, `postgrest`, `control-server`,
   `function-runner`, `caddy`, `minio`).

## What migrations touch (and what they don't)

Only the `platform` and `auth` schemas are managed by `node-pg-migrate` — see
`apps/control-server/migrations/`. Your own `api`/`private` schema objects (tables, views,
functions, RLS policies created through the SQL editor) are never touched by an upgrade; they're
exclusively developer-driven and have no tooling-managed shape to migrate.

## Secrets

Nothing secret lives in the repo. Every credential (`BAAS_ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`,
`AUTH_JWT_PRIVATE_KEY_BASE64`/`AUTH_JWT_PUBLIC_KEY_BASE64`, `INITIAL_ADMIN_PASSWORD`, MinIO root
credentials) comes from `.env` (or files it points at) and is passed to containers purely as
environment variables — an upgrade never requires touching a secret's value, and `git pull` never
overwrites your `.env` (it isn't tracked). If you rotate a secret, update `.env` and re-run step 3
above to restart the affected services with the new value.

## Rollback

If an upgrade goes wrong:

1. Restore the pre-upgrade database snapshot from step 1:
   ```bash
   docker compose --env-file .env -f infrastructure/docker/docker-compose.yml exec -T postgres \
     psql -U baas_admin "$POSTGRES_DB" < backup-YYYYMMDD.sql
   ```
2. Check out the previous commit/tag and rebuild:
   ```bash
   git checkout <previous-ref>
   docker compose --env-file .env -f infrastructure/docker/docker-compose.yml up --build -d
   ```

There is no automated schema-rollback path — `npm run migrate:down` (inside
`apps/control-server`) reverses the most recent `platform`/`auth` migration if you need to unwind
schema changes without a full database restore, but for anything beyond the schema (data changes,
config drift) the snapshot restore above is the reliable path.
