# ── samity-api production image ──────────────────────────────────────────────
# Multi-stage build from the npm workspace root: `packages/shared` is a
# workspace dependency of the API, so the build context must be the repo root.
#
#   docker build -t samity-api .
#   docker run --env-file .env -p 4000:4000 samity-api
#
# Runtime install uses --omit=dev, so only production dependencies are shipped.
# See docs/deploy.md for the full host checklist.

# syntax=docker/dockerfile:1

# ── Stage 1: build ───────────────────────────────────────────────────────────
# Node 22 is required, not merely preferred: @supabase/supabase-js 2.116+ builds
# a WebSocket-backed Realtime client in `createClient` and throws
# "native WebSocket not found" on Node 20 (and warns that Node ≤20 support is
# deprecated). The API also relies on global fetch.
FROM node:22-alpine AS build
WORKDIR /app

# Manifest files first so the dependency layer is cached across source edits.
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Only the two workspaces this image needs (the web app's deps stay out).
RUN npm ci -w @samity/api -w @samity/shared --include-workspace-root \
      --no-audit --no-fund

COPY packages/shared packages/shared
COPY apps/api apps/api

# `tsc` never deletes stale output, so clear dist first: a previously-built
# tree (including compiled *.test.js) must not leak into the image.
# tsconfig.build.json is what the `build` script uses and excludes test files.
RUN rm -rf apps/api/dist packages/shared/dist \
 && npm run build:shared \
 && npm run build -w @samity/api \
 && test -f apps/api/dist/server.js

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000

# Production dependencies only.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev -w @samity/api -w @samity/shared --include-workspace-root \
      --no-audit --no-fund \
 && npm cache clean --force

# Compiled output from the build stage (shared first — the API imports it).
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist

# Run unprivileged.
RUN addgroup -S samity && adduser -S samity -G samity
USER samity

EXPOSE 4000

# Container-level liveness probe; /api/v1/health is unauthenticated.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]
