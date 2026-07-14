# database-bootstrap

One-time PostgreSQL initialization SQL: platform roles (§9) and empty `platform`/`auth`/`api`/
`private` schemas (§12). Run automatically by
[`infrastructure/postgres/init/00-bootstrap.sh`](../../infrastructure/postgres/init/00-bootstrap.sh)
the first time the `postgres` container starts against an empty data volume.

This is distinct from `apps/control-server/migrations` (node-pg-migrate), which manages the
*shape* of tables inside `platform` and `auth` going forward. `api`/`private` are never
touched by migration tooling — they're populated by developers through the SQL editor.
