FROM postgres:16-alpine

# Build context is the repo root (see infrastructure/docker/docker-compose.yml) so this can
# reach packages/database-bootstrap, which is not inside this directory.
COPY --chmod=755 infrastructure/postgres/init/00-bootstrap.sh /docker-entrypoint-initdb.d/00-bootstrap.sh
COPY packages/database-bootstrap/sql /docker-entrypoint-initdb.d/sql
