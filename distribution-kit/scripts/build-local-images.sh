#!/usr/bin/env bash
# Builds and tags the three personal-baas images from a local monorepo checkout, so the
# docker-compose.personal-baas.yml overlay can use them without a registry.
#
# Usage:
#   ./scripts/build-local-images.sh /path/to/personal-baas-monorepo [tag]
#
# The tag defaults to the version in this kit's .env (0.1.0). Build context must be the repo
# root — the Dockerfiles expect npm-workspace siblings (packages/*) at the context root.
set -euo pipefail

REPO="${1:?usage: build-local-images.sh /path/to/personal-baas-monorepo [tag]}"
TAG="${2:-0.1.0}"

if [[ ! -f "$REPO/package.json" || ! -d "$REPO/apps/control-server" ]]; then
  echo "error: $REPO does not look like the personal-baas monorepo root" >&2
  exit 1
fi

echo "Building and tagging images with :${TAG}"

docker build -t "personal-baas-control-server:${TAG}" \
  -f "$REPO/apps/control-server/Dockerfile" "$REPO"

docker build -t "personal-baas-function-runner:${TAG}" \
  -f "$REPO/apps/function-runner/Dockerfile" "$REPO"

docker build -t "personal-baas-postgres:${TAG}" \
  -f "$REPO/infrastructure/postgres/Dockerfile" "$REPO"

echo "Done. Set BAAS_*_IMAGE in .env to these tags (they already match the defaults)."
