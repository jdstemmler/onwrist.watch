FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle ./drizzle
# Run unprivileged: an app compromise (e.g. an image-decoder bug) shouldn't
# get root, and photo files land on the bind mount owned by uid 1000 instead
# of root. The host ./data dir must be chown'd to 1000:1000 — see
# docs/deploy.md "Photo storage ownership".
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "build"]
