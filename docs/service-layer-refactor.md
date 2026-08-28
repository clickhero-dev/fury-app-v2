# Planejamento & Guia — Refatoração da Camada de Service

**Repositório:** `clickhero-dev/fury-app-v2` · **Camada:** `apps/api/src`
**Status:** planejamento (branch `dev`, após merge #142) · **Base:** ADR-0001 (camada de repository)
**Objetivo secundário do ADR-0001:** separar **router** de **service** e converter **services em classes** com injeção de dependências.

---

## 0. Objetivo

> Mover todo o **código de serviço/negócio** para `apps/api/src/services/*` e converter
> os services em **classes** que recebem no construtor os **repositórios** e os
> **serviços externos** de que precisam.

Camada-alvo:
```
routes/  →  controllers/  →  services/  →  repository/  +  serviços externos
(roteamento)  (glue HTTP)    (domínio/negócio)  (banco)        (llm, meta, asaas, storage, email)
```

---

## 1. Arquitetura de camadas (contrato)

```
requisição
   │
   ▼
routes/ .......................... só mapeia URL → handler (router.get('/x', handler))
   │
   ▼
controllers/ ..................... CAMADA HTTP (glue fino) — adapta req/res p/ service
   ├─ parse + validação (zod)
   ├─ extrai tenantId / params / query
   ├─ chama 1 serviço (instância injetada no construtor)
   ├─ serializa resposta (DTO) e monta status
   └─ next(error) — NÃO mapeia erro
   │
   ▼
services/ ........................ CAMADA DE DOMÍNIO (classe pura)
   ├─ regras de negócio
   ├─ orquestra repositórios + serviços externos
   ├─ responsável por transações
   └─ lança AppError (código + mensagem) — NÃO tem status HTTP
   │
   ▼
repository/ + externos ........... acesso a banco e integrações (llm, meta, asaas, storage, email)
```

### 1.1 Responsabilidades por camada

| Camada | Responsabilidade | **NÃO** faz |
|---|---|---|
| `routes/` | `router.get/post/put/delete`, aplicar middlewares (auth, tenant) | carregar lógica |
| `controllers/` | parse/validação, extrair contexto, chamar service, montar resposta/DTO, `next(err)` | `db`/repo · chamar externo · regra de negócio · fazer `new Service` no handler |
| `services/` | regra de negócio, orquestração de repos+externos, transações | importar `express`/`req`/`res` · serializar HTTP |
| `repository/` | acesso a dados (já feito, ADR-0001) | regra de negócio |
| externos (`llms`, `meta`, `google`, `asaas`, `storage`, `email`) | integração | — |

### 1.2 Fluxo de erro
1. Service lança `AppError(403, 'FORBIDDEN', 'msg')` (sem status HTTP hardcoded além do que o AppError carrega).
2. Controller faz `next(error)`.
3. Middleware `errorHandler` mapeia `AppError → HTTP status` + corpo JSON.
4. Nenhuma camada acima do service precisa conhecer protocolo HTTP.

### 1.3 Regra de ouro (testabilidade)
> **Service puro** = zero import de `express`. Só recebe dados `(tenantId, input)` e retorna DTOs.
> Isso permite testar com vitest mockando apenas **repos + externos**, sem subir HTTP.

---

## 2. Relação Controller ↔ Service (regras práticas)

1. **Controller recebe o service no construtor** — nunca `new XService()` dentro do handler.
2. **Service não conhece Controller** — o service é independente e reutilizável por N controllers.
3. **Um service serve vários endpoints** — ex.: `PlannerService.createPlan()` usado por 2 rotas.
4. **Composition root** instancia tudo uma vez (`services/index.ts` ou `di.ts`) e injeta.
5. **Rotas** podem chamar o controller diretamente (`router.get('/x', ctrl.list)`).

> **Alternativa rejeitada:** rota→service direto (sem controller). Mantemos controllers
> como adaptadores HTTP porque o projeto já os usa, e isso preserva: service testável sem
> HTTP, reuso entre endpoints, fronteira estável p/ troca de framework e serialização reutilizável.

---

## 3. Inventário atual

### 3.1 Rotas → onde mora o negócio

Legenda: 🟩 delegado (fino) · 🟨 parcial · 🟥 inline (extrair)

| Arquivo | Linhas | Estado | Onde mora | Ação |
|---|---|---|---|---|
| `auth.routes.ts` | 26 | 🟩 | `auth.controller` → `core/auth.service` (funções) | converter service em classe |
| `automation.routes.ts` | 23 | 🟩 | `automation.controller` → `automation.service` | idem |
| `billing.routes.ts` | 276 | 🟨 | subscribe/webhook inline + `asaas.service` + `SubscriptionRepository` | `BillingService` |
| `brand-kit.routes.ts` | 219 | 🟥 | inline (`db` + upload + `toResponse`) | `BrandKitService` |
| `budget.routes.ts` | 63 | 🟩 | `budget.controller` → `budget-optimizer.service` | — |
| `bull-board.routes.ts` | 54 | 🟩 | UI (infra/ops) | manter |
| `campaigns.routes.ts` | 59 | 🟩 | `campaigns.controller` → `CampaignsService` | — (já classe) |
| `dashboard.routes.ts` | 8 | 🟩 | `dashboard.controller` | — |
| `forms.routes.ts` | 23 | 🟩 | `forms.controller` → `forms.service` | classe |
| `fury.routes.ts` | 213 | 🟥 | inline (`FuryEngineRepository`) | `FuryEngineService` |
| `goals.routes.ts` | 445 | 🟥 | inline (`db` + provider + projeção/alertas) | `GoalService` |
| `google.routes.ts` | 50 | 🟩 | `google.controller` → `google.service` (funções) | classe |
| `health.ts` / `index.ts` | 17/67 | 🟩 | infra/roteamento | manter |
| `instagram.routes.ts` | 9 | 🟩 | `instagram.controller` | — |
| `meta.routes.ts` | 42 | 🟩 | `meta.controller` → `meta.service` (funções) | classe |
| `metrics.routes.ts` | 41 | 🟩 | `MetricsController` + `MetricsService` (**classe**) | ✔ padrão de referência |
| `observability.routes.ts` | 223 | 🟥 | inline raw-SQL (GLOBAL/infra) | `ObservabilityService` |
| `openrouter.routes.ts` | 518 | 🟥 | inline (geração/regen/edição) | `OpenRouterStudioService` |
| `planner.routes.ts` | 63 | 🟩 | `planner.controller` → `planner.service` (funções) | classe |
| `studio.routes.ts` | 806 | 🟨 | inline + `studio.controller` + services | `StudioService` classe |
| `superadmin.routes.ts` | 66 | 🟩 | `superadmin.controller` | — |

### 3.2 Services → classe ou função

| Service | Arquivo | Hoje | Target |
|---|---|---|---|
| `MetricsService` | `campaigns/metrics.service.ts` | **classe** | ✔ referência |
| `CampaignsService` | `campaigns/campaigns.service.ts` | classe | ✔ (absorver `DefaultCampaignRepository`) |
| `BudgetOptimizerService` | `campaigns/budget-optimizer.service.ts` | classe | ✔ |
| `WorkflowEngine`/`PostgresCheckpointStore` | `stateMachine/*` | classes | ✔ |
| `MetaService` | `meta/meta.service.ts` (16 fn) | funções | classe |
| `InstagramService` | `meta/instagram.service.ts` | funções | classe |
| `GoogleService` | `google/google.service.ts` (19 fn) | funções | classe |
| `PlannerService` + `PlannerStudioService` | `planner/*` | funções | classe |
| `StudioService` + `StudioImage/Copy/Render/Quota` | `studio/*` | funções | classe |
| `FuryEngineService` | `llms/fury-engine.service.ts` | funções | classe |
| `AuthService` / `SocialAuthService` | `core/auth` + `social-auth` | funções | classe |
| `FormsService` | `forms/forms.service.ts` | funções | classe |
| `AutomationService` | `automation/automation.service.ts` | funções | classe |

### 3.3 Repositórios disponíveis (para DI)
`repository/`: `TenantScopedRepository` (base) + `Planner`, `Studio`, `Meta`, `Subscription`
(assina+billing+quota), `Campaign`, `Google`, `FuryEngine`, `Automation`, `Auth` (users/tenants,
GLOBAL por email/slug), `Forms`, `SuperAdmin` (GLOBAL), `WorkflowJob` (GLOBAL).

### 3.4 Serviços externos (para DI)
`openrouterService` (`llms/openrouter.service.ts`), `deepseekService` (`llms/deepseek.service.ts`),
`AsaasService` (`billing/asaas`), `storageService` (`storage`), `EmailService` (`email`),
clientes Meta API/Google API, `MetricsProvider` (`DatabaseMetricsProvider`/`MockMetricsProvider`).

---

## 4. Guias / convenções

### 4.1 Service-classe (template)
```ts
// services/{dominio}/goal.service.ts
import { AppError } from '../../middleware/errorHandler.js';
import { CampaignRepository } from '../../repository/campaign.repository.js';
import type { MetricsProvider } from '../../lib/providers/metrics.provider.js';

export class GoalService {
  // repos + externos injetados (nada de importar db/repo fora do construtor)
  constructor(
    private campaigns: CampaignRepository,
    private metrics: MetricsProvider,
  ) {}

  async getProgress(tenantId: string) {
    const goals = await this.campaigns.findClientGoal(); // repo scoped no construtor (tenant)
    const summary = await this.metrics.getSummary(tenantId, '2026-08-01', '2026-08-27');
    if (!goals) throw new AppError(404, 'NO_GOALS', 'Defina metas primeiro');
    return this.project(goals, summary); // regra de negócio pura aqui
  }

  private project(/* ... */) { /* lógica extraída da rota */ }
}
```
> Quando o repo é scoped por tenant, o construtor já recebe `tenantId`? **Não.** O service cria
> repo por chamada ou recebe um factory: `new CampaignRepository(tenantId)` em `campaigns.getRepo(tenantId)`.
> Padrão recomendado: **passar tenantId nos métodos** e criar o repo interno a partir de um factory
> injetado (`makeCampaignRepo(tenantId)`) — ou injetar repo já com tenant se o service for por-tenant.

### 4.2 Controller (template, glue fino)
```ts
// controllers/goal.controller.ts
import type { Request, Response, NextFunction } from 'express';
import { GoalService } from '../services/{dominio}/goal.service.js';
import { goalBodySchema } from '../schemas/goal.schema.js';

export class GoalController {
  constructor(private service: GoalService) {} // service injetado (factory)

  getProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const data = await this.service.getProgress(tenantId);      // negócio
      res.json({ success: true, data, timestamp: new Date().toISOString() }); // serializa
    } catch (error) {
      next(error);                                                  // não mapeia erro
    }
  };
}
```

### 4.3 Composition root (`services/index.ts` ou `di.ts`)
```ts
// di.ts
const repositories = { /* instancia todos os repos */ };
const externals = { openrouterService, asaasService, storageService, metricsProvider };

export const services = {
  goal: new GoalService(repositories.campaign, externals.metricsProvider),
  studio: new StudioService(repositories.studio, repositories.planner, externals.openrouterService),
  // ...
};
export const controllers = {
  goal: new GoalController(services.goal),
  // ...
};
```
> Rotas importam `controllers` e usam `router.get('/x', controllers.goal.getProgress)`.
> Proibido `new XService()` dentro de handler de rota/controller.

### 4.4 Middlewares e validação
- Uso de `authMiddleware` + `tenantMiddleware` nas rotas (extraem `req.tenant!`).
- Schemas **zod** ficam em `schemas/` (ou junto do controller) — não no service.

### 4.5 TDD por fase
- Teste do **service-classe** mockando repos+externos injetados (padrão `*repository.test.ts` já usado).
- Teste do **controller** (opcional) com service real/mock, chamando o handler com req/res fake.
- **Critério de done:** `pnpm run build` exit 0 + vitest do domínio verde + sem `db.*`/repos em rotas.

### 4.6 Regras gerais
- Service **exporta classe com nome** (`export class GoalService`), instanciada no composition root.
- Construtor recebe **repos + externos**; nada de importar `db` por fora.
- Métodos de service recebem `(tenantId, input)`; repos GLOBAL usados em services de admin/diagnóstico.
- Transações ficam no service (via repo ou `db.transaction`).
- Erros sempre `AppError` (service) → `errorHandler` (mapeia status).

---

## 5. Plano em fases

> Cada fase entrega **build + testes verdes** e um service-classe com DI. Ordenado por domínio
> (começa pelo maior vazamento e pelos padrões fáceis).

### Fase 0 — Fundação / padrão
- Definir template de service-classe; criar `di.ts` (composition root) + `controllers/middleware`
  auxiliares; documentar contrato (este arquivo).
- Criar 1 service de exemplo (ex.: `GoalService`) como "prova de conceito" do padrão.
- **Done:** padrão validado com `MetricsService` e 1 POC; guia fechado.

### Fase 1 — Goals (maior vazamento)
- Extrair projeção/alertas/period de `goals.routes.ts` (445) → `GoalService` (classe).
- Dependências: `CampaignRepository` (goals→clientGoals, campaigns) + `MetricsProvider`.
- `goals.routes` vira fina + `GoalController`.
- **TDD:** `goal.service.test.ts` (projeção, alertas, sem-Meta) + `goal.controller.test.ts`.

### Fase 2 — BrandKit
- Extrair CRUD + upload de `brand-kit.routes.ts` (219) → `BrandKitService`.
- Dependências: repo (base/brandKits) + `storageService`.
- **TDD:** `brand-kit.service.test.ts`.

### Fase 3 — FuryEngine
- `fury.routes.ts` (213) → `FuryEngineService` (config/rules/scores/history) + `FuryController`.
- Dependências: `FuryEngineRepository` + `CampaignRepository` + llm client.
- **TDD.**

### Fase 4 — Studio + OpenRouter (as duas maiores)
- Extrair generate/regen/edit de `studio.routes.ts` (806) e `openrouter.routes.ts` (518)
  → `StudioService` + `OpenRouterStudioService`.
- Dependências: `StudioRepository`, `PlannerRepository`, `SubscriptionRepository` + `openrouterService`,
  `storageService`, `complianceQueue`.
- **TDD** (regen/edit com mock de openrouter/storage).

### Fase 5 — Billing
- Extrair subscribe/webhook de `billing.routes.ts` (276) → `BillingService`.
- Dependências: `SubscriptionRepository` + `AsaasService` + `emailService`.
- **TDD.**

### Fase 6 — Conversão dos services-função em classes (DI)
- Meta, Google, Planner(+PlannerStudio), Auth(+Social), Forms, Automation.
- Absorver `DefaultCampaignRepository`/`ICampaignRepository` no `CampaignsService`.
- Serviços externos (openrouter/deepseek/asaas/storage/email/providers) viram dependências injetadas.
- **TDD por domínio.**

### Fase 7 — Observability (GLOBAL/diagnóstico)
- `observability.routes.ts` (223) → `ObservabilityService` (raw-SQL GLOBAL).
- **TDD.**

### Escopo / fora de escopo (confirmar)
- **Escopo:** rotas, controllers, services, composition root, DI.
- **Fora:** workers, `request_logs`, bull-board (infra/ops), migrations.

---

## 6. Riscos e mitigações
- **Mudança de assinatura em massa** (services usados em workers/controllers) → mudanças por domínio,
  com regressão verde antes de cada commit.
- **Controllers espessos existentes** → não refatorar tudo de uma vez; converter o service-classe
  primeiro e depois afinar o controller.
- **Transações** (register/webhook) → manter `db.transaction` dentro do service, nunca na rota.
- **Repo scoped por tenant vs service** → padronizar: `(tenantId)` nos métodos + factory de repo injetado.

---

## 7. Próximos passos (ação imediata)
1. ⬜ **Fase 0**: fechar este guia como padrão (commitar o doc) + criar `di.ts`.
2. ⬜ **Fase 1**: `GoalService` (POC real no maior vazamento).
3. ⬜ Propor abertura de issue/PR por fase (conforme fluxo do projeto).

---

*Gerado em 2026-08-27 (branch `dev`). Fonte: decisão do usuário sobre controller↔service (glue fino + service puro).*