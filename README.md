# FURY — Paid Traffic Automation Platform

Plataforma SaaS de automação de tráfego pago que integra com **Meta Ads API**,
com criação criativa por IA, otimização de orçamento inteligente e motor de
regras automatizadas baseado em performance.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| **Backend** | Node.js + Express + TypeScript |
| **Frontend** | React 19 + Vite 8 + Tailwind CSS 4 + Radix UI |
| **Database** | PostgreSQL 16 + Drizzle ORM |
| **Cache/Filas** | Redis 7 + BullMQ |
| **AI** | Anthropic Claude, OpenAI DALL-E 3, OpenRouter, DeepSeek |
| **Billing** | Asaas |
| **Storage** | S3-compatible (AWS SDK) |
| **Imagens** | @napi-rs/canvas, sharp |

---

## Estrutura do Monorepo

```
fury/
├── apps/
│   ├── api/              # Backend Express (~100 source files)
│   └── web/              # Frontend React SPA (~134 source files)
├── packages/
│   ├── shared/           # Tipos TypeScript, enums, DTOs
│   └── db/               # Drizzle ORM + schema PostgreSQL
├── infra/                # Docker Compose (PostgreSQL + Redis)
├── scripts/              # QA audit, security audit
└── package.json          # NPM Workspaces
```

---

## Funcionalidades

### 🔐 Autenticação e Usuários
- Registro/login com JWT (access + refresh token)
- Verificação de email via OTP
- Recuperação de senha
- Múltiplos papéis: `owner`, `admin`, `member`, `superadmin`
- Isolamento multi-tenant (cada tenant com seus próprios dados)

### 📊 Meta Ads
- Conexão OAuth com Meta (Facebook/Instagram)
- Gerenciamento de contas de anúncio, páginas, WhatsApp Business
- Criação e sincronização de campanhas
- Métricas de performance (ROAS, CPA, CTR, CPC, etc.)
- Conversão de eventos

### 🎨 Creative Studio
- Geração de imagens com IA (DALL-E 3 / OpenRouter)
- 5 arquétipos visuais com seleção automática via Layout Selector Agent (DeepSeek)
- Renderização de criativos com `@napi-rs/canvas`
- Geração de copy com IA (headlines, descrições, CTAs)
- Suporte a formatos: feed, stories, banner
- Estilos: fotográfico, ilustração, minimalista
- Pipeline de compliance antes da publicação

### 🤖 Fury Engine
- Motor de insights baseado em IA (Anthropic Claude)
- Sugestões de otimização por campanha
- Análise de performance com scoring A-F
- Recomendações contextualizadas ao negócio do cliente

### ⚡ Automação e Regras
- Regras de performance acionáveis (CPC, CTR, ROAS, CPA, spend)
- Ações: pausar campanha, reduzir/aumentar orçamento, notificar
- Execução em background via workers BullMQ

### 💰 Otimizador de Orçamento
- Alocação baseada em performance (grade A-F)
- Modos: sugestão (manual) ou automático
- Distribuição proporcional entre campanhas

### 📱 Instagram
- Insights orgânicos (comentários, salvamentos, seguidores)
- Ranking de posts por objetivo (visitas, engajamento, mensagens, WhatsApp)

### 📋 Dashboard e Métricas
- Agregação de métricas multi-campanha
- Visualização com Recharts
- Insights condensados do Fury Engine

### 💳 Billing (Asaas)
- Planos de assinatura (mensal/anual)
- Ciclo de vida: trial → active → past_due → cancelled
- Faturas e pagamentos
- Seed de planos via script

### 🏢 Superadmin
- Gerenciamento de tenants (criar, editar, deletar)
- Gerenciamento de usuários por tenant
- Visualização de campanhas de qualquer tenant
- Gerenciamento de planos

### 🔧 Infraestrutura
- PostgreSQL 16 com Row-Level Security (RLS)
- Redis para cache, rate limiting, refresh tokens e filas BullMQ
- Criptografia AES-256-GCM para tokens Meta
- Request logging com particionamento por data
- Health check em `/api/health`

---

## Rotas da API

| Rota | Autenticação | Descrição |
|------|-------------|-----------|
| `GET /api/health` | — | Health check |
| `POST /api/auth/register` | — | Registro |
| `POST /api/auth/login` | — | Login |
| `POST /api/auth/refresh` | — | Refresh token |
| `POST /api/auth/verify-email` | — | Verificar email |
| `POST /api/auth/forgot-password` | — | Esqueci senha |
| `POST /api/auth/reset-password` | — | Resetar senha |
| `POST /api/auth/logout` | ✓ | Logout |
| `GET /api/auth/me` | ✓ | Dados do usuário |
| `PATCH /api/auth/me` | ✓ | Atualizar perfil |
| `POST /api/auth/change-password` | ✓ | Alterar senha |
| `GET /api/meta/auth/*` | Varia | Meta OAuth |
| `GET /api/meta/scopes` | ✓ | Escopos Meta conectados |
| `GET /api/meta/pages` | ✓ | Páginas do Facebook |
| `GET /api/meta/businesses` | ✓ | Negócios Meta |
| `POST /api/meta/save-selection` | ✓ | Salvar seleção de ativos |
| `PATCH /api/meta/connections/:id/*` | ✓ | Gerenciar conexões |
| `GET /api/campaigns/*` | ✓ | CRUD de campanhas |
| `GET /api/metrics/*` | ✓ | Métricas agregadas |
| `GET /api/dashboard/*` | ✓ | Dashboard |
| `GET /api/instagram/*` | ✓ | Instagram insights |
| `GET/POST /api/studio/*` | ✓ | Creative Studio |
| `GET /api/budget/*` | ✓ | Otimizador de orçamento |
| `GET /api/automation/*` | ✓ | Regras de automação |
| `GET /api/fury/*` | ✓ | Fury Engine insights |
| `GET /api/goals/*` | ✓ | Metas do cliente |
| `GET /api/billing/*` | ✓ | Planos e assinatura |
| `GET /api/brand-kit/*` | ✓ | Brand Kit |
| `POST /api/forms/*` | ✓ | Formulários |
| `POST /api/openrouter/*` | ✓ | Proxy OpenRouter |
| `GET /api/observability/*` | ✓ | Request logs |
| `GET /api/admin/*` | Superadmin | Gestão de tenants/usuários |

---

## Frontend

React SPA com as seguintes seções:

- **Dashboard** — Métricas gerais, insights do Fury Engine
- **Campanhas** — Painel, insights por campanha, regras de performance
- **Creative Studio** — Geração de criativos com IA
- **Gerador de Imagem** — Criação de imagens avulsa
- **Orçamento Smart** — Otimizador de budget
- **Automação** — Regras automatizadas
- **Configurações** — Brand Kit, Público-alvo, Integrações (Meta), FURY Config
- **Onboarding** — Conexão Meta, definição de metas, seleção de ativos
- **Assinatura** — Planos e gerenciamento de billing
- **Superadmin** — Gestão de tenants, usuários, planos e campanhas

Construído com React 19, Vite 8, Tailwind CSS 4, Radix UI primitives,
React Router DOM v7, TanStack React Query, Redux Toolkit e Recharts.

---

## Workers (Background Jobs)

Todos via BullMQ + Redis:

| Worker | Descrição |
|--------|-----------|
| **Studio Generation** | Geração de imagens via IA + compliance |
| **Compliance Check** | Verificação de conformidade de criativos |
| **Budget Optimizer** | Otimização periódica de orçamento |
| **Fury Engine** | Geração de insights com Claude |
| **Rule Engine** | Execução de regras de performance |

---

## Banco de Dados

18 tabelas gerenciadas via Drizzle ORM:

| Tabela | Descrição |
|--------|-----------|
| `tenants` | Organizações/clientes |
| `users` | Usuários (com tenant_id) |
| `meta_connections` | Conexões Meta Ads |
| `campaigns` | Campanhas publicitárias |
| `creative_assets` | Assets criativos (imagem, vídeo, copy) |
| `client_goals` | Objetivos dos clientes |
| `fury_insights` | Sugestões do Fury Engine |
| `automation_rules` | Regras de automação |
| `budget_optimizations` | Otimizações de orçamento |
| `performance_rules` | Regras de performance |
| `performance_scores` | Scores de performance (A-F) |
| `rule_executions` | Histórico de execução de regras |
| `fury_config` | Benchmarks de scoring por tenant |
| `form_submissions` | Submissões de formulários |
| `plans` | Planos de assinatura (globais) |
| `subscriptions` | Assinaturas dos tenants |
| `invoices` | Faturas |
| `brand_kits` | Brand kit (logo, cores, tom de voz) |
| `request_logs` | Logs de requisição (particionado por data) |

Segurança: **Row-Level Security (RLS)** habilitado em todas as tabelas
com escopo por tenant, garantindo isolamento total entre clientes.

---

## Início Rápido

### Pré-requisitos

- Node.js >= 18
- Docker & Docker Compose
- pnpm (recomendado) ou npm

### Setup

```bash
# 1. Instalar dependências
pnpm install

# 2. Configurar ambiente
cp infra/.env.example infra/.env
# Editar infra/.env com suas configurações

# 3. Iniciar infraestrutura
docker compose -f infra/docker-compose.yml up -d

# 4. Rodar migrations
pnpm run db:migrate

# 5. Iniciar dev
pnpm run dev
```

### Comandos

```bash
pnpm run dev                  # Desenvolvimento (todos os apps)
pnpm run build                # Build (shared → db → api/web)
pnpm run lint                 # Lint todos os workspaces
pnpm run db:migrate           # Rodar migrations
pnpm run db:studio            # Abrir Drizzle Studio (:5555)
pnpm run db:seed              # Popular banco com dados iniciais
pnpm run test                 # Rodar testes
pnpm run test:unit            # Só testes unitários (sem DB)
pnpm run test:coverage        # Testes com relatório de cobertura
pnpm run qa:audit             # Auditoria de QA (cobertura + falhas)
pnpm run security:audit       # Auditoria de segurança
```

---

## Variáveis de Ambiente

Ver `infra/.env.example`. Principais:

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Conexão PostgreSQL |
| `REDIS_URL` | Conexão Redis |
| `JWT_SECRET` | Chave para assinar JWTs |
| `JWT_REFRESH_SECRET` | Chave para refresh tokens |
| `TOKEN_ENCRYPTION_KEY` | Chave AES-256-GCM para tokens Meta |
| `META_APP_ID` / `META_APP_SECRET` | Credenciais Meta Ads API |
| `OPENAI_API_KEY` | API key DALL-E 3 |
| `ANTHROPIC_API_KEY` | API key Claude |
| `OPENROUTER_API_KEY` | API key OpenRouter |
| `ASAAS_API_KEY` | API key Asaas billing |
| `AWS_*` | credenciais S3 |
| `PORT` | Porta do servidor (default: 3000) |

---

## Cobertura de Testes (Jul 2026)

| Cenário | Testes | Cobertura API (lines) | Cobertura Web |
|---------|--------|----------------------|---------------|
| **Unitários** (`npm run test:unit`) | 13 files · sem DB | **~40.71%** | 0% |
| **Completo** (`npm run test`) | 29 files · 54 testes | ~31% | 0% |

### Testes unitários (13 arquivos) — não precisam de PostgreSQL

Incluem: JWT, rate limit, SSE, saniteze, métricas, Meta insights/conversion events,
campaigns service, billing/subscription, studio copy (validate + simple), data São Paulo.

Cobertura detalhada dos unitários por módulo:

| Módulo | Statements | Branches | Functions | Lines |
|--------|-----------|----------|-----------|-------|
| **Total API** | 40.71% | 34.02% | 39.62% | 40.82% |
| middleware | 54.47% | 77.61% | 66.66% | 53.71% |
| services | 49.06% | 37.91% | 31.81% | 51.07% |
| utils | **86.08%** | **76.38%** | **93.93%** | **85.85%** |
| lib | 17.08% | 11.16% | 13.88% | 17.37% |

### Testes totais: 54 total · 45 pass · 9 fail

**Falhas conhecidas:**

1. `wizard-diagnostics.test.ts` — 6 failures: assertions esperam 502, código retorna 400 _(STALE)_
2. `compliance-check.test.ts` — 3 failures: mock OpenAI usa arrow fn em vez de class _(ENV)_
3. 10 suites de integração precisam PostgreSQL @ localhost:5432 (fury_test)

### Comandos

```bash
pnpm run test:unit      # 13 testes unitários (sem DB) — ~40.71% coverage
pnpm run test           # Suite completa (54 testes, 45 pass, 9 fail)
pnpm run test:coverage  # Completo com relatório de cobertura
pnpm run qa:audit       # Auditoria de QA (cobertura + falhas listadas)
```

---

## Segurança

- [x] Helmet headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- [x] Rate limiting (Redis-based)
- [x] Autenticação JWT (access + refresh tokens)
- [x] Validação de input com Zod
- [x] Row-Level Security no PostgreSQL
- [x] Criptografia AES-256-GCM para tokens Meta
- [x] Sanitização de dados sensíveis em logs
- [x] Script de auditoria de segurança automatizado

```bash
pnpm run security:audit
```

---

## Agentes OpenCode

O projeto inclui agentes OpenCode para tarefas especializadas:

- **`@qa`** — Auditoria de cobertura de testes, identificação de gaps e falhas
- **`@security`** — Auditoria de segurança completa com análise de vulnerabilidades

---

## Infraestrutura Docker

| Serviço | Imagem | Porta | Nome Container |
|---------|--------|-------|----------------|
| PostgreSQL | postgres:16-alpine | 5432 | fury-postgres |
| Redis | redis:7-alpine | 6379 | fury-redis |

---

## Documentação Adicional

- [Drizzle ORM](https://orm.drizzle.team)
- [Express.js](https://expressjs.com)
- [Zod](https://zod.dev)
- [Meta Ads API](https://developers.facebook.com/docs/marketing-apis)
- [BullMQ](https://docs.bullmq.io)
- [React Router DOM v7](https://reactrouter.com)
- [Tailwind CSS v4](https://tailwindcss.com)

---

## Licença

Proprietary — FURY Platform
