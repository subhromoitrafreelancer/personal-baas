# Build context is the repo root (see infrastructure/docker/docker-compose.yml) so npm
# workspaces can resolve sibling packages during install/build -- same shape as
# apps/control-server/Dockerfile.
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/function-runner/package.json apps/function-runner/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build --workspace apps/function-runner

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/function-runner/dist ./apps/function-runner/dist
COPY apps/function-runner/package.json ./apps/function-runner/package.json

WORKDIR /repo/apps/function-runner
EXPOSE 3002
CMD ["node", "dist/main.js"]
