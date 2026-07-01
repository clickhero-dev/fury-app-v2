FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy root workspace config (npm workspaces, not pnpm for Docker build)
COPY package.json ./

# Copy web app config files
COPY apps/web/package.json apps/web/
COPY apps/web/tsconfig.json apps/web/
COPY apps/web/tsconfig.app.json apps/web/
COPY apps/web/tsconfig.node.json apps/web/
COPY apps/web/vite.config.ts apps/web/
COPY apps/web/index.html apps/web/

# Copy shared packages config (needed for npm install workspace resolution)
COPY packages/ packages/

RUN npm install

# Copy web source
COPY apps/web/src apps/web/src/

WORKDIR /app/apps/web
RUN npm run build

FROM node:22-alpine AS production

RUN apk add --no-cache fontconfig font-opensans font-dejavu

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/dist ./dist
COPY --from=builder /app/apps/web/vite.config.ts ./

EXPOSE 80

CMD ["node_modules/.bin/vite", "preview", "--host", "0.0.0.0", "--port", "80"]
