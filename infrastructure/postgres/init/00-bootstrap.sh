#!/usr/bin/env bash
# Runs once, automatically, the first time the postgres container starts against an empty
# data volume (standard docker-entrypoint-initdb.d behaviour). Substitutes role passwords
# from environment variables into the roles template, then applies both bootstrap SQL files.
set -euo pipefail

SQL_DIR="/docker-entrypoint-initdb.d/sql"

: "${BAAS_ADMIN_PASSWORD:?BAAS_ADMIN_PASSWORD must be set}"
: "${AUTHENTICATOR_PASSWORD:?AUTHENTICATOR_PASSWORD must be set}"

sed \
  -e "s/\${BAAS_ADMIN_PASSWORD}/${BAAS_ADMIN_PASSWORD}/g" \
  -e "s/\${AUTHENTICATOR_PASSWORD}/${AUTHENTICATOR_PASSWORD}/g" \
  "${SQL_DIR}/001_roles.sql.template" \
  | psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f "${SQL_DIR}/002_schemas.sql"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f "${SQL_DIR}/003_schema_reload_trigger.sql"
