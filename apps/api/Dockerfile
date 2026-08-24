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

FROM node:22-alpine
RUN apk add --no-cache fontconfig font-opensans font-dejavu

# Install pnpm for prod install
RUN npm install -g pnpm

WORKDIR /app

ENV NODE_ENV=production
# 2GB container: ~1.5GB heap leaves room for native memory (sharp, workers, buffers)
ENV NODE_OPTIONS="--max-old-space-size=1536"

# Copy package files for production install
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/tsconfig.json /app/.npmrc ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/db/package.json ./packages/db/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts and runtime files
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/swagger.json ./apps/api/swagger.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
# dist/migrate.js lê os .sql de packages/db/migrations ao aplicar migrações
# pendentes no boot — sem eles, o container cai com ENOENT na 1ª pendente.
COPY --from=builder /app/packages/db/migrations ./packages/db/migrations

EXPOSE 3000
CMD ["sh", "-c", "node packages/db/dist/migrate.js && node apps/api/dist/index.js"]
