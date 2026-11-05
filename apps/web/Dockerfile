FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++
# Versão pinada = mesma do desenvolvimento local (ver `pnpm --version`).
# pnpm@latest quebrou o allowBuilds/onlyBuiltDependencies no pnpm 12 (ERR_PNPM_IGNORED_BUILDS).
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm i --frozen-lockfile --config.dangerouslyAllowAllBuilds=true

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

ARG VITE_POSTHOG_KEY
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY

COPY . .
RUN pnpm run build

FROM node:22-alpine AS production

RUN apk add --no-cache fontconfig font-opensans font-dejavu

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/vite.config.ts ./
COPY --from=builder /app/dist ./dist

EXPOSE 80

CMD ["node_modules/.bin/vite", "preview", "--host", "0.0.0.0", "--port", "80"]
