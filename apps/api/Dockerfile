FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ fontconfig

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/

RUN pnpm install --frozen-lockfile

COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/

RUN pnpm --filter @fury/shared run build
RUN pnpm --filter @fury/db run build
RUN pnpm --filter @fury/api run build

RUN pnpm prune --prod --config.confirmModulesPurge=false

FROM node:22-alpine
RUN apk add --no-cache fontconfig font-opensans font-dejavu

WORKDIR /app

ENV NODE_ENV=production
# 2GB container: ~1.5GB heap leaves room for native memory (sharp, workers, buffers)
ENV NODE_OPTIONS="--max-old-space-size=1536"

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/tsconfig.json ./
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages ./packages

EXPOSE 3000
CMD ["sh", "-c", "node packages/db/dist/migrate.js && node apps/api/dist/index.js"]
