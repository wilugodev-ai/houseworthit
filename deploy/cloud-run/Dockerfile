FROM node:24.19.0-bookworm-slim AS workspace
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN npm install --global pnpm@12.5.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/calculations/package.json ./packages/calculations/package.json

FROM workspace AS api-dependencies
RUN pnpm install --frozen-lockfile --prod --filter @houseworthit/api...

FROM workspace AS build
RUN pnpm install --frozen-lockfile --prod=false
COPY packages/calculations/tsconfig.json ./packages/calculations/tsconfig.json
COPY packages/calculations/src ./packages/calculations/src
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/src ./apps/api/src
COPY apps/web/tsconfig.json apps/web/next-env.d.ts apps/web/next.config.ts ./apps/web/
COPY apps/web/app ./apps/web/app
RUN pnpm --filter @houseworthit/calculations build && pnpm --filter @houseworthit/api build && CLOUD_RUN_BUILD=1 pnpm --filter @houseworthit/web build

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=8080 NEXT_TELEMETRY_DISABLED=1 API_URL=http://127.0.0.1:4400 STORAGE_BACKEND=neon
WORKDIR /app
COPY --from=api-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=api-dependencies --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/packages/calculations/package.json ./packages/calculations/package.json
COPY --from=build --chown=node:node /app/packages/calculations/dist ./packages/calculations/dist
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=node:node deploy/cloud-run/start.mjs ./deploy/cloud-run/start.mjs
USER node
EXPOSE 8080
CMD ["node", "deploy/cloud-run/start.mjs"]
