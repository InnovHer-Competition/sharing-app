# Build from the repository root:
#   docker build -f apps/server/Dockerfile -t pcos-health-ledger-api .

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @pcos/server --include-workspace-root
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build --workspace @pcos/server \
 && npm prune --omit=dev --workspace @pcos/server

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8787 \
    DATABASE_PATH=/data/pcos-ledger.db
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8787/api/health || exit 1
CMD ["node", "dist/index.mjs"]
