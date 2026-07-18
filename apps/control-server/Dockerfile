# Build context is the repo root (see infrastructure/docker/docker-compose.yml) so npm
# workspaces can resolve sibling packages during install/build.
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/control-server/package.json apps/control-server/package.json
COPY packages/client-sdk/package.json packages/client-sdk/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/database-bootstrap/package.json packages/database-bootstrap/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build --workspace apps/control-server

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/control-server/dist ./apps/control-server/dist
COPY apps/control-server/package.json ./apps/control-server/package.json
# Not run here — this image is also used by the control-server-migrate one-shot service
# (docker-compose.yml), which runs `npm run migrate:up` against these files before
# control-server itself starts.
COPY apps/control-server/migrations ./apps/control-server/migrations

WORKDIR /repo/apps/control-server
EXPOSE 3000
CMD ["node", "dist/main.js"]
