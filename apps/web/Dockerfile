# Stage 1: multi-stage install + build (run at monorepo root context)
FROM node:22-alpine AS builder

# Minimal build deps (node-gyp)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Root files required for install
COPY package.json package-lock.json tsconfig.json ./
COPY pnpm-lock.yaml ./

# Workspace pieces the web app depends on
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/

# Install workspace deps
RUN npm ci

# Import source
COPY apps/web apps/web
COPY packages/shared packages/shared
COPY packages/db packages/db

# Build *only* the web workspace
WORKDIR /app/apps/web
RUN npm run build

# Stage 2: slim production image
FROM node:22-alpine AS production

# Minimal runtime assets
RUN apk add --no-cache fontconfig font-opensans font-dejavu

WORKDIR /app

ENV NODE_ENV=production

# Minimal production install of the web workspace dependencies
COPY --from=builder /app/apps/web/package.json ./package.json
RUN npm install --omit=dev

# Built static assets
COPY --from=builder /app/apps/web/dist ./dist

EXPOSE 80

# Vite preview serves the built SPA folder
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "80"]
