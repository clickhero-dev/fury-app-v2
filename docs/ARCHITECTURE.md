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

## Fluxo 6: Workflows (State Machine / Saga)

Fluxos encadeados de agentes de IA são executados por uma **engine de
workflows** genérica (checkpoints no Postgres + fila BullMQ + retry/rollback +
recuperação de estado). O planejamento de conteúdo com IA é o primeiro fluxo
registrado.

> Documentação completa em [`docs/workflows/`](./workflows/README.md):
> - [Workflow Engine](./workflows/workflow-engine.md) — a biblioteca (conceitos, retry, rollback, recuperação)
> - [Planejar conteúdo](./workflows/planner-generate.md) — passo a passo do workflow `planner-generate`

Novos fluxos (campanhas, publicação, criativos) são adicionados apenas com
uma definição declarativa de stages — sem tocar na engine.

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

## Estrutura do Frontend (`apps/web`)

### Organização de Pastas

```
apps/web/src/
├── pages/                  # Páginas da aplicação (organizadas por módulo)
│   ├── auth/               # Login e cadastro
│   ├── onboarding/         # Fluxo de onboarding pós-cadastro
│   ├── dashboard/          # Dashboard e metas
│   ├── campanhas/          # Gerenciamento de campanhas
│   ├── estudio/            # Estúdio Criativo (copy e imagens)
│   ├── automacao/          # Regras de automação
│   ├── configuracoes/      # Configurações, integrações e brand kit
│   └── billing/            # Planos e assinatura
├── components/             # Componentes reutilizáveis
│   ├── ui/                 # Componentes base (button, card, input, etc.)
│   ├── layout/             # Layouts (AppLayout, AuthenticatedShell)
│   └── campaign-wizard/    # Wizard de criação de campanhas
├── hooks/                  # React hooks customizados
├── lib/                    # Utilitários, cliente API e mocks
├── types/                  # Tipos TypeScript por domínio
└── router.tsx              # Definição de rotas (React Router)
```

### Rotas da Aplicação

| Rota | Página | Autenticação |
|------|--------|-------------|
| `/login` | LoginPage | Não |
| `/cadastro` | RegisterPage | Não |
| `/onboarding/conectar-meta` | ConectarMetaPage | Não |
| `/onboarding/meta-authorize` | MetaAuthorizePage | Não |
| `/onboarding/selecionar-conta` | SelecionarAtivosPage | Sim |
| `/onboarding/metas` | MetasPage | Sim |
| `/dashboard` | Dashboard | Sim |
| `/dashboard/metas` | Metas | Sim |
| `/campanhas` | PainelCampanhas | Sim |
| `/campanhas/regras` | RegrasCampanhas | Sim |
| `/campanhas/:id/insights` | InsightsCampanha | Sim |
| `/automacao` | MinhasRegras | Sim |
| `/estudio` | EstudioHome | Sim |
| `/estudio/imagem` | GeradorImagem | Sim |
| `/estudio-criativo` | CreativeStudio | Sim |
| `/configuracoes` | Configuracoes | Sim |
| `/configuracoes/integracoes` | Integracoes | Sim |
| `/configuracoes/brand-kit` | BrandKitPage | Sim |
| `/planos` | Plans | Sim |
| `/assinatura` | Subscription | Sim |

### Hooks Principais

| Hook | Responsabilidade |
|------|-----------------|
| `useAuth` | Autenticação e sessão do usuário |
| `useCampaigns` | Listagem e gerenciamento de campanhas |
| `useCampaignInsights` | Métricas e insights de campanha |
| `useFurySSE` | Conexão SSE para atualizações em tempo real do FURY Engine |
| `useFuryLiveFeed` | Feed ao vivo de automações executadas |
| `useFuryRules` | Regras de automação configuradas |
| `useGoalsProgress` | Progresso em relação às metas mensais |
| `useBilling` | Planos e assinatura |
| `useBrandKit` | Brand kit da organização |

### Como o Frontend Consome a API

O cliente HTTP está centralizado em `apps/web/src/lib/api.ts` e usa a variável de ambiente `VITE_API_URL` como base URL. Todos os hooks fazem chamadas através desse cliente, que automaticamente inclui o token JWT no header `Authorization`.

---

## Segurança e Multi-tenancy

- Cada usuário pertence a uma **Organização**
- O banco usa **Row Level Security (RLS)** no Neon para garantir que queries só retornem dados da organização correta
- Tokens Meta são **criptografados em repouso** usando `TOKEN_ENCRYPTION_KEY`
- JWTs têm expiração curta; refresh tokens renovam o acesso
- CORS configurado para aceitar apenas origens listadas em `CORS_ALLOWED_ORIGINS`