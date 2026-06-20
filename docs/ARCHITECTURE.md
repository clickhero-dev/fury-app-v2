# Arquitetura e Fluxos Principais

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                     USUÁRIO (Browser)                    │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTPS
┌─────────────────────▼───────────────────────────────────┐
│              Frontend (React + Vite)                     │
│                  Vercel — CDN global                     │
└─────────────────────┬───────────────────────────────────┘
                      │ REST API
┌─────────────────────▼───────────────────────────────────┐
│              Backend (Express + TypeScript)              │
│                    Railway — Node.js                     │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │   Auth   │ │Campaigns │ │  Studio  │ │   FURY    │  │
│  │Controller│ │Controller│ │Controller│ │  Engine   │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
└────┬──────┬──────────┬──────────┬──────────┬────────────┘
     │      │          │          │          │
  ┌──▼──┐ ┌─▼──┐  ┌───▼───┐ ┌───▼───┐ ┌────▼────┐
  │Neon │ │Redis│  │ Meta  │ │Claude/│ │Cloudflare│
  │ DB  │ │Cache│  │Ads API│ │DeepSeek│ │   R2    │
  └─────┘ └────┘  └───────┘ └───────┘ └─────────┘
```

---

## Fluxo 1: Onboarding de Usuário

1. Usuário acessa o frontend e clica em **Criar conta**
2. Frontend envia `POST /api/auth/register` com email e senha
3. API cria o usuário no banco com hash da senha (bcrypt)
4. API cria uma **organização** vinculada ao usuário
5. RLS (Row Level Security) do Neon garante isolamento por organização
6. API retorna JWT de acesso + refresh token
7. Frontend armazena os tokens e redireciona para o dashboard
8. Usuário conecta sua conta Meta via OAuth (`GET /api/meta/auth-url` → callback)

---

## Fluxo 2: Criação de Campanha Meta (Wizard)

1. Usuário preenche o wizard no frontend
2. Frontend chama `POST /api/campaigns/create-wizard` com os dados
3. Backend valida os dados e chama a **Meta Ads API** para criar:
   - Campaign
   - Ad Set (com segmentação e orçamento)
   - Ad Creative (criativo vinculado)
   - Ad (anúncio ativo)
4. IDs retornados pela Meta são salvos no banco (Neon)
5. Frontend redireciona para o painel da campanha criada

**Upload de criativo no wizard:**

```
Frontend → POST /api/campaigns/upload-creative (multipart/form-data)
         → API valida (PNG/JPG, máx 5MB)
         → Salva no Cloudflare R2
         → Retorna URL pública do criativo
```

---

## Fluxo 3: Estúdio Criativo (Geração de Imagens)

1. Usuário descreve o criativo desejado no Estúdio
2. Frontend envia prompt para `POST /api/studio/generate`
3. Backend chama **DeepSeek** para refinar/expandir o prompt
4. Backend chama **DALL-E 3 (OpenAI)** com o prompt refinado
5. Imagem gerada é salva no **Cloudflare R2**
6. URL pública retorna ao frontend para preview
7. Usuário pode aprovar e usar o criativo em uma campanha

---

## Fluxo 4: FURY Engine (Automação e IA)

O FURY Engine roda a cada 30 minutos via fila BullMQ + Redis. Ele tem duas responsabilidades separadas:

**4a. Scoring de campanhas (sem IA — lógica própria)**

Para cada campanha ativa de cada tenant:
1. Busca as métricas salvas no banco (ROAS, CPA, CTR, spend, budget)
2. Calcula um **score de 0 a 100** com pesos: ROAS (40pts) + CTR (30pts) + CPA (20pts) + utilização de orçamento (10pts)
3. Converte o score em grade: A (≥90), B (≥75), C (≥60), D (≥40), F (<40)
4. Salva o score no banco e emite evento SSE para o frontend atualizar em tempo real
5. Avalia **regras de automação** configuradas pelo usuário (ex: "se CPA > 80, pausar") e registra execuções

**4b. Geração de insights (usa Claude)**

Quando o usuário acessa a análise FURY (`POST /api/fury/analyze`):
1. Busca metas do tenant (CPA alvo, orçamento mensal, nicho, objetivo)
2. Busca performance dos últimos 7 dias (campanhas ativas, ROAS médio, CPA médio, melhor/pior campanha)
3. Chama **Claude `claude-3-5-sonnet-20241022`** com um prompt contextualizado
4. Claude retorna 3 insights em JSON (tipo, título, descrição, prioridade)
5. Insights são salvos no banco e retornados ao frontend
6. Se a API key não estiver configurada, usa **insights de fallback** predefinidos

Endpoints relacionados:
- `GET /api/fury/status` — estado atual do engine
- `POST /api/fury/analyze` — gera insights com Claude para o tenant
- `GET /api/fury/logs` — histórico de automações executadas

---

## Fluxo 5: Observabilidade e Métricas

```
Meta Ads API
     │
     ▼
GET /api/metrics/*  ←─── Frontend Dashboard
     │
     ▼
  Banco (Neon)  ──→  Grafana (via db-metrics provider)
     │
  Redis Cache (TTL curto para métricas frequentes)
```

- Métricas são buscadas da Meta Ads API e armazenadas no banco
- Redis serve como cache para evitar rate limit da Meta API
- Grafana conecta diretamente ao banco para dashboards de observabilidade
- Endpoint principal: `GET /api/metrics/campaigns/:id`

---

## Estrutura de Dados Principal

```
Organization (tenant)
  └── Users (membros)
  └── Campaigns (campanhas Meta)
        └── Ad Sets
        └── Ad Creatives
        └── Metrics (snapshot periódico)
  └── Goals (metas de performance)
  └── Budget (controle de verba)
  └── Automations (regras do FURY Engine)
```

---

## Segurança e Multi-tenancy

- Cada usuário pertence a uma **Organização**
- O banco usa **Row Level Security (RLS)** no Neon para garantir que queries só retornem dados da organização correta
- Tokens Meta são **criptografados em repouso** usando `TOKEN_ENCRYPTION_KEY`
- JWTs têm expiração curta; refresh tokens renovam o acesso
- CORS configurado para aceitar apenas origens listadas em `CORS_ALLOWED_ORIGINS`