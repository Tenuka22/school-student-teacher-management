FROM oven/bun:1.4.0 AS builder
WORKDIR /app

COPY . .
# Only the web app's env is mounted: there is no `apps/server` in this
# repository, and the build used to mount a secret for one (audit F-28).
RUN --mount=type=secret,id=web_env,target=/app/apps/web/.env.local --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

ENV NODE_ENV=production
RUN --mount=type=secret,id=web_env,target=/app/apps/web/.env.local cd apps/web && bun run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Timestamps are stored without a time zone (see AGENTS.md); the server clock
# must therefore not depend on the host. School dates are computed in
# Asia/Colombo explicitly (`packages/db/src/dates.ts`).
ENV TZ=UTC
COPY --from=builder /app /app

ENV HOST=0.0.0.0
ENV PORT=3001
EXPOSE 3001

# SSR chunks require workspace dependencies at runtime
WORKDIR /app/apps/web
# The server ran as root (INFRA1). `node` is the unprivileged user the base
# image ships; the copied tree stays root-owned, so the process can read the
# app but not rewrite it. Nothing writes to the filesystem at runtime: photos
# live in Postgres. Untested here (no Docker on the remediation machine) —
# build and start the image once before relying on it.
USER node
# Migrate, then serve. A failed migration stops the container instead of
# starting a release against the wrong schema.
CMD ["sh", "-c", "node /app/scripts/migrate.mjs && exec node .output/server/index.mjs"]
