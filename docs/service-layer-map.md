# Mapa de Referência — Routers × Controllers × Services

**Repositório:** `clickhero-dev/fury-app-v2` · **Base:** `apps/api/src` · **Branch:** `dev`
**Propósito:** inventário detalhado de cada endpoint: escopo/domínio, contexto HTTP (auth/tenant/assinatura),
handler, service, repositórios e serviços externos, e onde a lógica de negócio vive hoje.
> Complementa `docs/service-layer-refactor.md` (o **guia/plano**). Este arquivo é o **mapa** (o "onde / o quê / quem").

---

## A. Grupos de rota (mount em `routes/index.ts`) + contexto

| Mount | Contexto (middlewares) | Obs |
|---|---|---|
| `/health` | público | check |
| `/auth` | público | register/login/verify/otp/google |
| `/meta` / `/google` | auth + tenant (internos nas rotas) | integrações |
| `/metrics` · `/instagram` · `/dashboard` · `/forms` · `/brand-kit` · `/planner` | `[auth, tenant, subscription]` | feature |
| `/campaigns` | `[auth, tenant, subscription]` (+ meta-locations/interests com `tenantOrSuperadmin`) | feature |
| `/studio` · `/openrouter` · `/fury` · `/goals` · `/billing` · `/automation` · `/budget` | auth+tenant (alguns sem subscription) | feature |
| `/observability` | `[auth, tenant, subscription]` | analytics GLOBAL |
| `/admin` (superadmin) · `/admin/queues` (bull-board) | superadmin | admin/ops |

> **Legenda de estado:** 🟩 **delegado** (rota→controller→service) · 🟨 **parcial** · 🟥 **inline** (negócio na rota).

---

## B. Rotas delegadas (🟩) — mapeamento endpoint → controller → service

### `/auth` (auth.routes — 12 endpoints · público)
| Endpoint | Handler | Service | Escopo |
|---|---|---|---|
| POST `/auth/register` | `authController.register` | `AuthService.register` | cadastro |
| POST `/auth/login` | `authController.login` | `AuthService.login` | sessão |
| POST `/auth/refresh` | `authController.refresh` | `AuthService.refresh` | token |
| POST `/auth/verify-email` | `authController.verifyEmail` | `AuthService.verifyEmail` | OTP |
| POST `/auth/forgot-password` | `authController.forgotPassword` | `AuthService.forgotPassword` | OTP |
| POST `/auth/reset-password` | `authController.resetPassword` | `AuthService.resetPassword` | senha |
| POST `/auth/logout` | `authController.logout` | `AuthService.logout` | sessão |
| GET `/auth/me` | `authController.getMe` | `AuthService.getMe` | perfil |
| PATCH `/auth/me` | `authController.updateMe` | `AuthService.updateMe` | perfil |
| POST `/auth/change-password` | `authController.changePassword` | `AuthService.changePassword` | senha |
| GET/POST `/auth/google/url\|callback` | `authController.*` | `SocialAuthService.handleGoogleSocialLogin` | social login |

**Service:** `core/auth.service.ts` (10 fn) + `core/social-auth.service.ts` · **Repo:** `AuthRepository` (users/tenants)
**Externos:** `jwt`, `redis` (refresh), `emailService`, `google-oauth` · **Hoje:** funções (→ classe em Fase 6).

### `/automation` (automation.routes — 6 endpoints)
| Endpoint | Handler | Service |
|---|---|---|
| GET `/automation/feed` | `automationController.getFeed` | `AutomationService` |
| POST/GET `/automation/rules` | `automationController.upsertRule`/`getRules` | `AutomationService.create/get` |
| DELETE `/automation/rules/:id` | `automationController.deleteRule` | `AutomationService` |
| GET `/automation/takedowns` | `automationController.getTakedowns` | repo `AutomationRepository.listSmartTakedowns` |
| POST `/automation/budget-smart` | `automationController.createBudgetSmart` | `BudgetOptimizerService` |

**Repo:** `AutomationRepository` (+ `furyInsights`) · **Service:** `automation.service.ts` (2 fn → classe Fase 6).

### `/campaigns` (campaigns.routes — 13 endpoints · auth+tenant+sub)
| Endpoint | Handler | Service |
|---|---|---|
| GET `/campaigns` | `campaignsController.list` | `CampaignsService.listCampaigns` |
| POST `/campaigns/create` / `create-wizard` | `campaignsController.create`/`createWizard` | `CampaignsService` |
| POST `/campaigns/mcp-log` | `campaignsController.logMcp` | `CampaignsService` |
| POST `/campaigns/upload-creative` | `campaignsController.uploadCreative` | `CampaignsService` + `storage` |
| POST `/campaigns/suggest-text` | `campaignsController.suggestText` | llm `openrouter/deepseek` |
| PATCH `/campaigns/:id/{pause,resume,status,budget}` | `campaignsController.*` | `CampaignsService` |
| GET `/campaigns/:id/insights` | `campaignsController.insights` | `MetricsService` + `furyInsights` |
| GET/PATCH/DELETE `/campaigns/:id` | `campaignsController.*` | `CampaignsService` |
| GET `/campaigns/meta-locations\|interests` | `searchMetaLocationsHandler`/`searchMetaInterestsHandler` | campanhas (search Meta) |

**Service:** `CampaignsService` (**classe**, injeta `ICampaignRepository`) · **Repos:** `CampaignRepository`, `FuryEngineRepository`(insight/score)
**Externos:** `openrouter/deepseek`, `storage`, `meta-api`, llm · **Hoje:** classe ✔.

### `/metrics` (metrics.routes — 6 endpoints · auth+tenant+sub)
| Endpoint | Handler | Service |
|---|---|---|
| GET `/metrics/summary` | `MetricsController.summary` | `MetricsService.getSummary` |
| GET `/metrics/campaigns` · `/campaigns/:campaignId/adsets` · `/:id/insights` | `MetricsController.*` | `MetricsService` |
| GET `/metrics/daily` | `MetricsController.daily` | `MetricsService` |
| GET `/metrics/goals-progress` | `MetricsController.goalsProgress` | `MetricsService` + goals |

**Service:** `MetricsService` (**classe**, injeta `MetricsProvider`) · **Externos:** provider instance
(`DatabaseMetricsProvider`/`MockMetricsProvider`) · **Hoje:** ✔ **padrão de referência**.

### `/planner` (planner.routes — 16 endpoints · auth+tenant+sub)
| Endpoint | Handler | Service |
|---|---|---|
| POST `/planner/generate` · GET `/planner/calendar` · GET `/planner/prerequisites` | `plannerController.*` | `PlannerService` (langchain) |
| GET/POST/PUT `/planner/plans(/:planId)` · `/plans/confirm` / `revalidate` / `latest` | `plannerController.*` | `PlannerService` |
| POST `/planner/posts` · POST `/posts/bulk` · POST `/posts/bulk-schedule` · POST `/posts/upload` | `plannerController.*` | `PlannerService` |
| GET/PATCH/DELETE `/planner/posts/:postId(/:postId/move)` | `plannerController.*` | `PlannerService` |
| POST `/planner/agent-labels` · GET `/planner/jobs/:jobId` · POST `/planner/cron/publish-due` · POST `/posts/publish-due` | `plannerController.*` | `PlannerService`/worker |

**Service:** `planner.service.ts` (20 fn) + `planner-studio/context` · **Repo:** `PlannerRepository`, `MetaRepository`
**Externos:** `openrouter`(llm, responseFormat zod), `complianceQueue`, `bull` · **Hoje:** funções (→ classe Fase 6).

### `/google` (google.routes — 15 endpoints · auth+tenant)
| Endpoint | Handler | Service |
|---|---|---|
| GET `/google/auth/url`·`/auth/callback` | `googleController.getAuthUrl`/`authCallback` | `GoogleService` (OAuth) |
| GET `/google/connections`·`/accounts`·`/lookup`·`/categories` | `googleController.*` | `GoogleService` |
| GET/PUT `/google/settings` | `googleController.*` | `GoogleService` (upsert settings) |
| POST `/google/profiles` · GET/PATCH `/profiles/:id` · `/verification` · POST `/sync` · GET `/sync-logs` · DELETE `/photos` | `googleController.*` | `GoogleService` (GBP) |

**Service:** `google.service.ts` (19 fn) · **Repo:** `GoogleRepository` (+ base lookups)
**Externos:** `google-api` client, `storage` · **Hoje:** funções (→ classe Fase 6).

### `/meta` (meta.routes — 13 endpoints · auth+tenant)
| Endpoint | Handler | Service |
|---|---|---|
| GET `/meta/auth/url`·`/callback`·`/test`·`/scopes` | `metaController.*` | `MetaService` (OAuth) |
| GET `/meta/pages`·`/businesses`·POST `/pages-by-business`·`/adaccounts-by-business`·`/whatsapp-by-pages` | `metaController.*` | `MetaService` |
| POST `/meta/save-selection`·GET `/asset-selection`·`/connections` | `metaController.*` | `MetaService` |

**Service:** `meta.service.ts` (16 fn) · **Repo:** `MetaRepository` · **Externos:** `meta-api` client · **Hoje:** funções (→ classe Fase 6).

### `/instagram` (instagram.routes — 2 endpoints · auth+tenant+sub)
GET `/instagram/posts-ranked` · `/media-proxy` → `instagramController` → `InstagramService` (repo `MetaRepository`).

### `/dashboard` (dashboard.routes — 1 endpoint · auth+tenant+sub)
GET `/dashboard/instagram-insights` → `dashboardController.getInstagramInsightsHandler` → `InstagramService`.

### `/budget` (budget.routes — 7 endpoints)
POST `/budget/optimize` · GET/POST/PATCH suggestions · POST apply/reject (single e bulk) · GET/PATCH `/config`
→ `budgetController` → `BudgetOptimizerService` (**classe**) + `SubscriptionRepository`(budgetOptimizations).

### `/forms` (forms.routes — 4 endpoints · auth+tenant+sub)
POST `/forms/start|complete|error|abandoned` → `formsController` → `FormsService` (repo `FormsRepository`; funções → classe Fase 6).

### `/superadmin` `/admin` (superadmin.routes — admin)
CRUD de tenants/users/plans/subscriptions + fury-config/brand-kit/goals/audience/campaigns/assets
→ `superadminController` → `SuperAdminRepository` (GLOBAL).

---

## C. Rotas com NEGÓCIO INLINE (🟥/🟨) — alvo da extração

### `/goals` (goals.routes — **445 linhas** · 🟥 · maior vazamento)
| Endpoint | Hoje | Deve virar |
|---|---|---|
| GET `/goals` | `db` direto (`clientGoals`) inline | `GoalController.get` → `GoalService.get` (repo `CampaignRepository`) |
| POST `/goals/setup` · PUT `/goals` | `db` direto (upsert goals) inline | `GoalService.upsert` |
| GET `/goals/progress` | **~250 linhas inline**: projeção de conversões/orçamento/ROAS, ideal×real, alertas de campanha, `db` (clientGoals, campaigns) + `MetricsProvider` | `GoalService.getProgress` (repo `CampaignRepository` + `MetricsProvider`) |

**Escopo:** metas de negócio do cliente · **Contexto:** auth+tenant · **Externos:** `MetricsProvider`.

### `/brand-kit` (brand-kit.routes — **219 linhas** · 🟥)
| Endpoint | Hoje | Deve virar |
|---|---|---|
| GET `/brand-kit` · PUT `/` | `db` direto (`brandKits`) + `toResponse` | `BrandKitService.get`/`upsert` |
| POST `/brand-kit/logo` · `/photos` · DELETE `/photos` | upload multer + storage + `db` inline | `BrandKitService.uploadLogo`/`uploadPhotos`/`removePhotos` (repo + `storageService`) |

**Escopo:** identidade visual (tom/cores/logos/fotos) · **Contexto:** auth+tenant+sub.

### `/fury` (fury.routes — **213 linhas** · 🟥)
| Endpoint | Hoje | Deve virar |
|---|---|---|
| GET `/fury/live-feed` | SSE inline | `FuryEngineService` (stream) |
| GET/PATCH `/fury/config` | `FuryEngineRepository` inline + build de config | `FuryEngineService.getConfig`/`updateConfig` |
| GET/POST/PATCH/DELETE `/fury/rules(/:id)` | repo inline + validação de regras | `FuryEngineService` (CRUD rules) |
| GET `/fury/scores` · `/history` | repo inline (scores/execuções) | `FuryEngineService.getScores`/`getHistory` |

**Escopo:** Fury Engine (performance/regras) · **Externos:** Anthropic/llm.

### `/openrouter` (openrouter.routes — **518 linhas** · 🟥)
| Endpoint | Hoje | Deve virar |
|---|---|---|
| POST `/openrouter/enhance-prompt`·`/generate-image`·`/generate-video`·`/models` | `openrouterService` + `StudioRepository` inline (geração FLUX/imagem/vídeo) | `OpenRouterStudioService.generate*` |
| POST `/openrouter/regenerate` · `/regenerate-ad` | edit/regeneração + `StudioRepository` inline + storage | `OpenRouterStudioService.regenerate*` |

**Escopo:** geração de criativos via OpenRouter · **Externos:** `openrouterService`, `storageService`.

### `/studio` (studio.routes — **806 linhas** · 🟨)
| Endpoint | Hoje | Deve virar |
|---|---|---|
| GET `/studio/assets` · POST `/assets` · GET/PATCH/DELETE `/assets/:assetId` | `studioController` + inline (contexto/prompt/creativeData) | `StudioService.listAsset`/`create`/`get`/`delete` |
| POST `/studio/creative/generate`·`/regenerate`·`/validate-context` | inline (brand kit + prompt + geração) | `StudioService.generateCreative` |
| POST `/studio/copy/generate` · `/generate-copy` · `/generate-image` · `/render-creative` · `/select-layout` | `studioController` + services copy/render/layout | `StudioService` |
| POST `/studio/upload-to-meta` · `/publish/:assetId` · `/preview-png` · `/storage-check` | `studioController` + inline | `StudioService` |

**Escopo:** estúdio (geração de imagens/cópias, compliance, Meta publish) · **Repo:** `StudioRepository`, `PlannerRepository`, `SubscriptionRepository`(quota)
**Externos:** `openrouterService`, `deepseekService`, `storageService`, `complianceQueue`, `meta-api` · **Hoje:** parcial (→ classe Fase 4).

### `/billing` (billing.routes — **276 linhas** · 🟨)
| Endpoint | Hoje | Deve virar |
|---|---|---|
| GET `/billing/plans` | `SubscriptionRepository` inline (catálogo) | `BillingService.listPlans` |
| POST `/billing/webhook` | webhook Asaas inline (sub + invoice upsert) | `BillingService.handleWebhook` |
| POST `/billing/subscribe` | assinatura inline (asaas + trial) | `BillingService.subscribe` |
| GET `/billing/subscription`·`/invoices` · DELETE `/subscription` | repo inline | `BillingService` |

**Escopo:** billing/assinatura/quota · **Repo:** `SubscriptionRepository` · **Externos:** `AsaasService`, `emailService` · **Hoje:** parcial (→ classe Fase 5).

### `/observability` (observability.routes — **223 linhas** · 🟥 · GLOBAL/infra)
GET `/observability` + query params → **raw SQL inline** (analytics global: campanhas, ROAS/CPA/CTR por tenant, MRR, conversão de trial, sidekiq).
**Escopo:** diagnóstico/admin (GLOBAL) · **Ação:** `ObservabilityService` (raw-SQL) — Fase 7.

---

## D. Controller × Service (referência cruzada)

| Controller | Arquivo | Injeta/usa | Service(s) |
|---|---|---|---|
| `AuthController` | `controllers/auth.controller.ts` | — | `AuthService`, `SocialAuthService` |
| `AutomationController` | `controllers/automation.controller.ts` | `AutomationRepository` | `AutomationService`, `BudgetOptimizerService` |
| `MetaController` | `controllers/meta.controller.ts` | — | `MetaService` |
| `GoogleController` | `controllers/google.controller.ts` | — | `GoogleService` |
| `InstagramController` | `controllers/instagram.controller.ts` | — | `InstagramService` |
| `MetricsController` | `controllers/metrics.controller.ts` | `MetricsService` | `MetricsService` |
| `CampaignsController` | `controllers/campaigns.controller.ts` | `DefaultMetaCampaignProvider` | `CampaignsService` |
| `PlannerController` | `controllers/planner.controller.ts` | — | `PlannerService` |
| `BudgetController` | `controllers/budget.controller.ts` | — | `BudgetOptimizerService` |
| `FormsController` | `controllers/forms.controller.ts` | — | `FormsService` |
| `SuperAdminController` | `controllers/superadmin.controller.ts` | `SuperAdminRepository` | — (repo direto) |
| `DashboardController` | `controllers/dashboard.controller.ts` | — | `InstagramService` |
| `StudioController` | `controllers/studio.controller.ts` | — | `StudioService` (parte) |
| *(inline)* | `goals.routes.ts` | `CampaignRepository`? | — (extrair `GoalService`) |
| *(inline)* | `fury.routes.ts` | `FuryEngineRepository` | — (extrair `FuryEngineService`) |
| *(inline)* | `openrouter.routes.ts` / `studio.routes.ts` / `billing.routes.ts` / `brand-kit.routes.ts` | repos | — (extrair services) |

---

## E. Resumo por estado
- **🟩 delegado (já fino):** auth, automation, campaigns, metrics, planner, google, meta, instagram, dashboard, budget, forms, superadmin.
- **🟥 inline (extrair):** goals, brand-kit, fury, observability, openrouter.
- **🟨 parcial (completar):** studio, billing.
- **Services-classe (padrão):** `MetricsService`, `CampaignsService`, `BudgetOptimizerService`, `WorkflowEngine`.
- **Services-função (→ classe):** `Auth`, `Automation`, `Meta`, `Instagram`, `Google`, `Planner`, `Studio`, `FuryEngine`, `Forms`.

---

*Gerado em 2026-08-27 (branch `dev`). Endpoints levantados de `routes/*` + `routes/index.ts`.*