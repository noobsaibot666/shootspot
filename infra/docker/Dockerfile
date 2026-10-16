# syntax=docker/dockerfile:1.7
# One Dockerfile, three targets: api, worker, admin.
#   docker build -f infra/docker/Dockerfile --target api -t shootspot-api .
# Services run TypeScript through tsx (ADR 0001); bundling is a later optimisation.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 CI=1
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /repo

# ---- install + build (only the server-side workspace packages) ----------------------------------
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY services/worker/package.json services/worker/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter "@shootspot/api..." --filter "@shootspot/worker..." --filter "@shootspot/admin..."
COPY packages/shared packages/shared
COPY services services
COPY apps/admin apps/admin
# Next.js bakes rewrite destinations in at build time: the admin proxies to the `api` container.
ARG ADMIN_API_URL=http://api:4000
RUN API_URL=$ADMIN_API_URL pnpm --filter @shootspot/admin build
# Self-contained production folders: each service gets only its own runtime dependencies.
RUN pnpm --filter @shootspot/api --prod deploy --legacy /out/api \
 && pnpm --filter @shootspot/worker --prod deploy --legacy /out/worker
# better-auth declares Next.js/React as *optional* peers (for its Next integration, unused here);
# pnpm links the admin's copy because it exists in the workspace. Drop ~330 MB from the API image.
RUN rm -rf /out/api/node_modules/.pnpm/next@* /out/api/node_modules/.pnpm/@next+* \
           /out/api/node_modules/.pnpm/react-dom@* /out/api/node_modules/.pnpm/react@* \
 && node -e "require('node:fs').readdirSync('/out/api/node_modules/.pnpm').forEach(d=>{if(/^(next|@next)/.test(d))process.exit(1)})"

# ---- api ----------------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS api
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/main.ts"]

# ---- worker -------------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/worker ./
USER node
CMD ["node", "--import", "tsx", "src/main.ts"]

# ---- admin (Next.js standalone) -----------------------------------------------------------------
FROM node:24-bookworm-slim AS admin
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/admin/.next/static ./apps/admin/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
