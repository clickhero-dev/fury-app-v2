# Plano de Migração — Fury App V2 para VPS

**Status:** 📋 Planejamento
**Branch:** `chore/migration-vps`
**PR #59** — já prepara centralização de env + Dockerfiles
**Previsão:** 3 dias

---

## Pré-requisitos (antes de começar)

- [ ] VPS contratada e acessível via SSH
- [ ] Domínios definidos (qual domínio vai apontar pra VPS?)
- [ ] Credenciais pendentes com Rafael (ANTHROPIC, OPENAI, DEEPSEEK, META, R2)
- [ ] Token do ClickUp atualizado no `.env` (já temos um funcional no `.hermes/.env`)

---

## 🔹 1. backup banco neon

**O que fazer:**
- Conectar no Neon (já temos MCP `neon` configurado)
- Rodar `pg_dump` via Docker ou直接
- Salvar dump em `~/backups/fury-neon-YYYY-MM-DD.sql`
- Verificar integridade do dump

**Comando:**
```bash
pg_dump --no-owner --no-acl \
  "postgresql://diogo_dev:...@ep-tiny-unit-an9xoof9-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require" \
  > ~/backups/fury-neon-$(date +%F).sql
```

---

## 🔹 2. organização variaveis de ambiente

**O que fazer:**
- Mergear PR #59 (`chore/migration-vps` → `dev`)
- Validar que `.env.example` na raiz cobre **todas** as variáveis
- Garantir que **nenhuma senha/credencial** está hardcoded no código
- Criar script de validação com Zod (já previsto no escopo)
- Mover secrets sensíveis para env_file do Docker

**PR #59 já inclui:**
- ✅ `.env.example` centralizado na raiz
- ✅ Fallbacks removidos do código
- ✅ `.env.development` e `.env.production` no frontend
- ✅ `docs/` com orientações

---

## 🔹 3. deployment redis

**O que fazer:**
- Adicionar Redis ao docker-compose da VPS
- Configurar volume persistente
- Sem dados migrados (Redis é cache/fila, é fresco)

---

## 🔹 4. deployment api

**O que fazer:**
- Criar `docker-compose.vps.yml` unificado (API + Redis + Frontend + Nginx)
- Fazer build da imagem `ghcr.io/clickhero-dev/fury-api:v0.0.1`
- Push da imagem para GHCR
- Configurar Docker na VPS
- Deploy do container via compose na VPS
- Healthcheck: `GET /api/health`
- Configurar SSL (Caddy ou Nginx Proxy Manager)

---

## 🔹 5. deployment front

**O que fazer:**
- Build da imagem `ghcr.io/clickhero-dev/fury-web:v0.0.1`
- Push para GHCR
- Adicionar ao docker-compose.vps.yml
- Configurar Nginx como reverse proxy
- SSL via Caddy

---

## 🔹 6. ajustar dns vps

**O que fazer:**
- Identificar provedor de DNS (Cloudflare? Registrar?)
- Apontar domínio principal (ex: `api.fury.clickhero.com.br` → IP da VPS)
- Apontar frontend (ex: `app.fury.clickhero.com.br` → IP da VPS)
- Aguardar propagação DNS

---

## 🔹 7. ajustar dominio na meta

**O que fazer:**
- Atualizar `META_DEFAULT_LINK_URL` no .env
- Atualizar `META_REDIRECT_URI` para o novo domínio
- Verificar webhooks do Meta Ads
- Testar fluxo de anúncio completo

---

## Fluxo de Execução

```
Semana 1 (22-26 Jun)
├── Dia 1: 🔹 backup banco + 🔹 vars ambiente (merge PR #59)
├── Dia 2: 🔹 redis + 🔹 api deploy
├── Dia 3: 🔹 front deploy + 🔹 dns
└── Dia 4: 🔹 meta + testes finais
```

## Riscos

1. **Credenciais pendentes** — sem ANTHROPIC/OPENAI/DEEPSEEK, LLMs não funcionam na VPS
2. **Domínio** — precisamos saber qual domínio vai ser usado
3. **VPS não contratada** — railway/vercel ainda são os únicos ambientes ativos
4. **PR #59 não mergeada** — precisa ser revisada e mergeada antes do deploy

---

*Plano criado em 19/06/2026 — atualizar conforme andamento*
