FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY server ./server
COPY src/platform/creative ./src/platform/creative
COPY scripts/build-core-server.mjs scripts/production-migration-inventory.mjs ./scripts/
RUN npm run server:build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/dist-server ./dist-server
COPY --from=build --chown=node:node /app/node_modules ./node_modules
USER node
EXPOSE 8080
CMD ["node", "dist-server/server.mjs"]
