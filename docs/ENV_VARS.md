# Variáveis de Ambiente

O projeto tem variáveis de ambiente em 3 lugares diferentes. Cada um tem seu próprio `.env`.

---

## `apps/api/.env` — Backend

### Servidor

| Variável | Exemplo | Descrição |
|----------|---------|-----------|
| `PORT` | `3000` | Porta da API |
| `NODE_ENV` | `development` | Ambiente (`development` ou `production`) |

### Banco de Dados (Neon)

| Variável | Exemplo | Descrição |
|----------|---------|-----------|
| `DATABASE_URL` | `postgresql://user:senha@ep-xxx.neon.tech/neondb` | URL principal do banco |
| `TEST_DATABASE_URL` | `postgresql://user:senha@ep-xxx-teste.neon.tech/neondb` | URL do banco de testes |

### Cache (Redis via Railway)

| Variável | Exemplo | Descrição |
|----------|---------|-----------|
| `REDIS_URL` | `redis://default:senha@containers-us-west-xxx.railway.app:6379` | URL do Redis |

### Autenticação JWT

| Variável | Descrição |
|----------|-----------|
| `JWT_SECRET` | Segredo para assinar tokens de acesso (mínimo 32 caracteres) |
| `JWT_REFRESH_SECRET` | Segredo para tokens de refresh (mínimo 32 caracteres) |

> 💡 Gere valores seguros com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### Meta Ads API

| Variável | Descrição |
|----------|-----------|
| `META_APP_ID` | ID do app no Meta for Developers |
| `META_APP_SECRET` | Secret do app Meta |
| `META_USE_MOCK` | `true` para dados simulados (dev sem credenciais Meta) |
| `TOKEN_ENCRYPTION_KEY` | Chave para criptografar tokens OAuth (mínimo 32 caracteres) |
| `META_REDIRECT_URI` | URI de callback OAuth (`http://localhost:3000/api/meta/callback` em dev) |
| `META_PAGE_ID` | ID da página do Facebook vinculada |
| `META_DEFAULT_LINK_URL` | URL padrão para links dos anúncios |

### Integrações de IA

| Variável | Descrição |
|----------|-----------|
| `ANTHROPIC_API_KEY` | Chave da API Anthropic (Claude) — usado no FURY Engine |
| `OPENAI_API_KEY` | Chave da OpenAI (DALL-E 3) — geração de imagens |
| `DEEPSEEK_API_KEY` | Chave DeepSeek — LLM principal do Estúdio Criativo |

### Billing (Asaas)

| Variável | Descrição |
|----------|-----------|
| `ASAAS_API_KEY` | Chave da API Asaas |
| `ASAAS_ENV` | `sandbox` (dev) ou `production` |
| `ASAAS_WEBHOOK_TOKEN` | Token para validar webhooks do Asaas |

### Storage (Cloudflare R2)

| Variável | Descrição |
|----------|-----------|
| `R2_ENDPOINT` | Endpoint do bucket R2 |
| `R2_ACCESS_KEY_ID` | Access Key do R2 |
| `R2_SECRET_ACCESS_KEY` | Secret Key do R2 |
| `R2_PUBLIC_URL` | URL pública para acessar os arquivos |

### URLs e CORS

| Variável | Exemplo | Descrição |
|----------|---------|-----------|
| `PUBLIC_BASE_URL` | `http://localhost:3000` | URL base da API (para assets públicos) |
| `APP_URL` | `https://fury-app-v2-production.up.railway.app` | URL da API em produção |
| `FRONTEND_URL` | `https://fury-app-v2-web.vercel.app` | URL do frontend em produção |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:5174` | Origens permitidas no CORS |

### Assets do Estúdio

| Variável | Exemplo | Descrição |
|----------|---------|-----------|
| `STUDIO_ASSETS_DIR` | `/tmp/studio-assets` | Diretório local para imagens geradas |

### Desenvolvimento

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `AUTH_BYPASS_DEV` | `false` | Bypass de autenticação — **NUNCA `true` em produção** |

---

## `apps/web/.env` — Frontend

| Variável | Exemplo | Descrição |
|----------|---------|-----------|
| `VITE_API_URL` | `http://localhost:3000/api` | URL base da API consumida pelo frontend |

Em produção, esse valor aponta para a URL do Railway.

---

## `packages/db/.env` — Banco (Migrations)

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | URL do banco principal com `?sslmode=require` |
| `TEST_DATABASE_URL` | URL do banco de testes com `?sslmode=require` |

> Esse `.env` é usado apenas para rodar migrations localmente via Drizzle Kit. Não é usado pelo servidor.

---

## Onde obter as credenciais

| Credencial | Onde encontrar |
|------------|---------------|
| `DATABASE_URL` | Painel do Neon → seu projeto → Connection string |
| `REDIS_URL` | Railway → seu serviço Redis → Variables |
| `META_APP_ID` / `META_APP_SECRET` | Meta for Developers → seu app |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `OPENAI_API_KEY` | platform.openai.com |
| `DEEPSEEK_API_KEY` | platform.deepseek.com |
| `ASAAS_API_KEY` | Painel Asaas → Integrações → API |
| `R2_*` | Cloudflare Dashboard → R2 → seu bucket |