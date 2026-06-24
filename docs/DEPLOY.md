# Deploy e Produção

## Visão Geral da Infraestrutura

| Serviço | Plataforma | O que roda |
|---------|-----------|------------|
| Frontend | Vercel | React + Vite |
| API | Railway | Node.js Express |
| Redis | Railway | Cache e filas |
| Banco de dados | Neon | PostgreSQL serverless |
| Storage de imagens | Cloudflare R2 | Criativos gerados pelo Estúdio |
| Observabilidade | Grafana | Dashboards de métricas |

---

## Frontend — Vercel

**URL de produção:** https://fury-app-v2-web.vercel.app

O deploy é automático a cada push na branch `main`.

**Variável de ambiente necessária no painel da Vercel:**

| Variável | Valor em produção |
|----------|------------------|
| `VITE_API_URL` | `https://fury-app-v2-production.up.railway.app/api` |

**Para acessar o painel:** https://vercel.com → projeto `fury-app-v2-web`

---

## API — Railway

**URL de produção:** https://fury-app-v2-production.up.railway.app

O deploy é automático a cada push na branch `main`.

**Variáveis de ambiente:** configurar no painel do Railway → seu projeto → aba *Variables*. Usar os mesmos valores do `apps/api/.env.example` com valores reais de produção.

**Diferenças importantes em produção:**

```env
NODE_ENV=production
META_USE_MOCK=false
AUTH_BYPASS_DEV=false
ASAAS_ENV=production
STUDIO_ASSETS_DIR=/tmp/studio-assets   # Railway usa /tmp para arquivos temporários
```

**Para acessar o painel:** https://railway.app → projeto FURY

---

## Redis — Railway

Rodando como serviço separado no mesmo projeto Railway.

A `REDIS_URL` é gerada automaticamente pelo Railway e deve ser copiada para as variáveis de ambiente da API.

---

## Banco de Dados — Neon

**Plataforma:** https://console.neon.tech

O Neon é um PostgreSQL serverless — escala automaticamente e tem branching de banco (útil para criar ambientes de teste sem custo extra).

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

> ⚠️ Sempre teste as migrations no branch `dev` antes de rodar em `main`.

**Row Level Security (RLS):** o banco usa RLS para isolamento multi-tenant. As policies são aplicadas via migrations — nunca altere manualmente no painel do Neon.

---

## Storage — Cloudflare R2

Usado para armazenar imagens geradas pelo Estúdio Criativo de forma persistente.

**Por que R2?** O Railway usa sistema de arquivos efêmero (arquivos em `/tmp` somem no próximo deploy). O R2 garante que os criativos gerados persistam.

**Configuração no painel:** https://dash.cloudflare.com → R2 → seu bucket

**Variáveis necessárias na API:**

```env
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<sua_access_key>
R2_SECRET_ACCESS_KEY=<sua_secret_key>
R2_PUBLIC_URL=https://<seu_dominio_publico_r2>
```

---

## Observabilidade — Grafana

Grafana conecta diretamente ao Neon para criar dashboards de métricas de campanhas.

**Datasource:** PostgreSQL (usar a `DATABASE_URL` de produção como string de conexão read-only)

**Dashboards principais:**
- Visão geral de campanhas ativas
- Métricas por organização (CTR, CPM, ROAS)
- Logs de automações do FURY Engine

---

## Fluxo de Deploy Completo

```
Push na branch main
       │
       ├──▶ Vercel detecta mudança
       │         └──▶ Build: npm run build (apps/web)
       │         └──▶ Deploy automático no CDN
       │
       └──▶ Railway detecta mudança
                 └──▶ Build: npm run build (apps/api)
                 └──▶ Restart do serviço Node.js
                 └──▶ Migrations NÃO rodam automaticamente
                            └──▶ Rodar manualmente se necessário
```

> ⚠️ **Migrations não são automáticas.** Sempre que houver mudança de schema, rode manualmente antes ou logo após o deploy da API.

---

## Checklist de Deploy

- [ ] Variáveis de ambiente atualizadas no Railway e Vercel
- [ ] Migrations rodadas no banco de produção (se houver mudança de schema)
- [ ] `META_USE_MOCK=false` na API de produção
- [ ] `AUTH_BYPASS_DEV=false` na API de produção
- [ ] `ASAAS_ENV=production` se billing estiver ativo
- [ ] CORS atualizado com as URLs corretas de produção
- [ ] Testado o health check: `GET /api/health`