# Build from the repository root:
#   docker build -f apps/server/Dockerfile -t pcos-health-ledger-api .

FROM node:24-alpine AS base
# pnpm version comes from "packageManager" in package.json.
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
# Every workspace manifest is needed for the frozen-lockfile check.
COPY apps/web/package.json apps/web/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter "@pcos/server..."
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @pcos/server build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @pcos/server

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8787 \
    DATABASE_PATH=/data/pcos-ledger.db
# pnpm links packages from the root store, so keep the same layout.
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/apps/server/node_modules /app/apps/server/node_modules
COPY --from=build /app/apps/server/dist /app/apps/server/dist
WORKDIR /app/apps/server
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8787/api/health || exit 1
CMD ["node", "dist/index.mjs"]
