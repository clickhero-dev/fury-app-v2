FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ fontconfig

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/

RUN npm ci

COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/

RUN npm run build --workspace=@fury/shared
RUN npm run build --workspace=@fury/db
RUN npm run build --workspace=@fury/api

RUN npm prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache fontconfig font-opensans font-dejavu

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=384"

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/tsconfig.json ./
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages ./packages

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
