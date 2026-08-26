#!/usr/bin/env bash
# Builds and tags the three personal-baas images from a local monorepo checkout, so the
# docker-compose.personal-baas.yml overlay can use them without a registry.
#
# Usage:
#   ./scripts/build-local-images.sh /path/to/personal-baas-monorepo [control-server-tag] [other-tag]
#
# control-server-tag defaults to 0.4.0, other-tag (function-runner + postgres, which currently
# release together) defaults to 0.1.0 — matching this kit's .env.example. Build context must be
# the repo root — the Dockerfiles expect npm-workspace siblings (packages/*) at the context root.
set -euo pipefail

REPO="${1:?usage: build-local-images.sh /path/to/personal-baas-monorepo [control-server-tag] [other-tag]}"
CONTROL_SERVER_TAG="${2:-0.4.0}"
OTHER_TAG="${3:-0.1.0}"

if [[ ! -f "$REPO/package.json" || ! -d "$REPO/apps/control-server" ]]; then
  echo "error: $REPO does not look like the personal-baas monorepo root" >&2
  exit 1
fi

echo "Building control-server :${CONTROL_SERVER_TAG}, function-runner/postgres :${OTHER_TAG}"

docker build -t "personal-baas-control-server:${CONTROL_SERVER_TAG}" \
  -f "$REPO/apps/control-server/Dockerfile" "$REPO"

docker build -t "personal-baas-function-runner:${OTHER_TAG}" \
  -f "$REPO/apps/function-runner/Dockerfile" "$REPO"

docker build -t "personal-baas-postgres:${OTHER_TAG}" \
  -f "$REPO/infrastructure/postgres/Dockerfile" "$REPO"

echo "Done. Set BAAS_*_IMAGE in .env to these tags (they already match the defaults)."
