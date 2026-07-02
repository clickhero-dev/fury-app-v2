# Deploy e Produção

## Visão Geral da Infraestrutura

| Serviço | Plataforma | O que roda |
|---------|-----------|------------|
| API | EasyPanel (VPS) | Node.js Express |
| Frontend | EasyPanel (VPS) | React + Vite |
| Redis | EasyPanel (VPS) | Cache e filas BullMQ |
| Banco de dados | Neon | PostgreSQL serverless |
| Storage de imagens | Cloudflare R2 | Criativos gerados pelo Estúdio |
| Observabilidade | Grafana (EasyPanel VPS) | Dashboards de métricas |

---

## EasyPanel — Deploy Automático

**Painel:** https://painel.nerdrico.com.br → projeto `clickhero`

Ambos os serviços (`fury_api` e `fury_web`) usam build direto do GitHub:
- **Branch monitorada:** `dev`
- **Repositório:** `clickhero-dev/fury-app-v2`

### URLs de Produção

| Serviço | URL |
|---------|-----|
| API | `https://clickhero-fury-api.u7pe19.easypanel.host` |
| Frontend | `https://clickhero-fury-web.u7pe19.easypanel.host` |

### Webhooks de Deploy

```bash
# API
curl -X POST http://185.111.156.157:3000/api/deploy/f8383c07327bdfbc8bc4183fc407bdd4905650d99aa76f16

# Web
curl -X POST http://185.111.156.157:3000/api/deploy/188a40b7aa994d0d54e99ec4a027de61a7138e15e450a791
```

> ⚠️ Os webhooks disparam deploy manual. Para deploy automático a cada push no `dev`, ative o "Auto Deploy" no painel (Overview do serviço → botão "Ativar Deploy Automático").

---

## Build Context (Monorepo)

| Serviço | Build Path | Dockerfile |
|---------|-----------|------------|
| `fury_api` | `/` (raiz) | `apps/api/Dockerfile` |
| `fury_web` | `/apps/web` | `Dockerfile` |

---

## Variáveis de Ambiente no EasyPanel

Configurar na aba **Environment** de cada serviço:

### fury_api

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://redis-click-hero:6379
JWT_SECRET=...
JWT_REFRESH_SECRET=...
META_APP_ID=...
META_APP_SECRET=...
META_USE_MOCK=false
AUTH_BYPASS_DEV=false
ASAAS_ENV=production
STUDIO_ASSETS_DIR=/tmp/studio-assets
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
DEEPSEEK_API_KEY=...
R2_ENDPOINT=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_URL=...
APP_URL=https://clickhero-fury-api.u7pe19.easypanel.host
FRONTEND_URL=https://clickhero-fury-web.u7pe19.easypanel.host
DOMAIN=clickhero-fury-api.u7pe19.easypanel.host
META_REDIRECT_URI=https://clickhero-fury-api.u7pe19.easypanel.host/api/meta/auth/callback
CORS_ALLOWED_ORIGINS=https://clickhero-fury-web.u7pe19.easypanel.host
```

### fury_web

```env
VITE_API_URL=https://clickhero-fury-api.u7pe19.easypanel.host/api
```

> ⚠️ `VITE_*` são build-time. Alterações exigem novo deploy.

---

## Redis — EasyPanel

Serviço `redis-click-hero` no mesmo projeto EasyPanel.

A API acessa via hostname interno: `redis://redis-click-hero:6379`

---

## Banco de Dados — Neon

**Plataforma:** https://console.neon.tech

**Branches recomendados:**

| Branch | Uso |
|--------|-----|
| `main` | Produção |
| `dev` | Desenvolvimento/testes |

**Para rodar migrations em produção:**

```bash
cd packages/db
DATABASE_URL=<url_producao> npm run db:migrate
```

> ⚠️ Migrations NÃO rodam automaticamente. Rode manualmente após deploy que altere schema.

---

## Storage — Cloudflare R2

Usado para armazenar imagens geradas pelo Estúdio Criativo de forma persistente.

**Configuração no painel:** https://dash.cloudflare.com → R2 → seu bucket

---

## Observabilidade — Grafana

Grafana roda como serviço `grafana` no mesmo projeto EasyPanel.

Conecta diretamente ao Neon para dashboards de métricas de campanhas.

---

## Fluxo de Deploy

```
Push na branch dev
       │
       ├──▶ EasyPanel detecta mudança (se auto-deploy ATIVO)
       │         ├── fury_api: build apps/api/Dockerfile
       │         └── fury_web: build apps/web/Dockerfile
       │
       └──▶ (se auto-deploy OFF) Disparar webhook ou clicar "Implantar"
```

---

## Checklist de Deploy

- [ ] Auto-deploy ativo em ambos os serviços
- [ ] Variáveis de ambiente atualizadas no EasyPanel
- [ ] Migrations rodadas no banco de produção (se houve mudança de schema)
- [ ] `META_USE_MOCK=false` na API de produção
- [ ] `AUTH_BYPASS_DEV=false` na API de produção
- [ ] `ASAAS_ENV=production` se billing estiver ativo
- [ ] `META_REDIRECT_URI` configurada com domínio correto
- [ ] Testado o health check: `GET /api/health`
