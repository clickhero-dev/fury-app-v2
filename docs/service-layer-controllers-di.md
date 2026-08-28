# Plano — Consistência da Arquitetura (controllers no DI)
**Status:** ✅ **CONCLUÍDO** (Fases A+B+C mergeados; todos os 20 controllers são classes no `di.ts`).

**Branch:** `feat/service-layer-planning` · **Objetivo:** todo controller é **classe** no **`di.ts`**, recebendo **services-classe** via construtor. Rotas finas. Meta do ADR-0001 (objetivo secundário, agora fechando o ciclo controllers).

## Estado atual (inventário — 20 controllers) — ✅ todos convertidos

| Tipo | Controllers | No `di.ts`? |
|---|---|---|
| **Classe ✅** | `goal, brandKit, fury, openrouter, studio(creative), billing, observability, forms` | ✅ sim |
| **Classe ⚠️** | `metrics` | ❌ **não** (gap) |
| **Função de módulo ❌** | `auth, automation, budget, campaigns, dashboard, google, instagram, meta, planner, studio(original), superadmin` | ❌ não |

## Passo 1 — Todos os services como classes
Feature-services já são classes; faltam os de **módulo** usados pelos controllers:
| Service | Virar classe |
|---|---|
| `meta/instagram.service.ts` | → `InstagramService` (classe) |
| `studio/studio.service.ts` (persist/upload/publish) | → `StudioPublishingService` (classe) — reter funções-factory do worker |
| `studio/studio-image.service.ts`, `layout-selector.service.ts` | avaliar absorver ou manter (leaf/worker) |
| `metrics.service`, `budget-optimizer.service`, `campaigns.service` | já são classes |

> LLM adapters (`deepseek.service`, `openrouter.service`) e `storage.service`/`email.service`/`asaas.service` são **serviços externos injetáveis** — continuam singletons/imports (não são feature-services).

## Passo 2 — Services passam para os controllers (por construtor)
Cada controller vira classe recebendo seu(s) service(s):

| Controller | Recebe (services-classe) |
|---|---|
| `AuthController` | `AuthService`, `SocialAuthService` |
| `AutomationController` | `AutomationService` (+ SSE `emitToTenant`) |
| `BudgetController` | `BudgetOptimizerService`,`MetricsService` |
| `CampaignsController` | `CampaignsService` |
| `DashboardController` | `MetricsService` |
| `GoogleController` | `GoogleService` |
| `InstagramController` | `InstagramService`, `MetaService` |
| `MetaController` | `MetaService` |
| `PlannerController` | `PlannerService` |
| `StudioController` | `StudioPublishingService` |
| `SuperAdminController` | `SuperAdminRepository` (+ services já refatorados) |
| `MetricsController` | `MetricsService` |

## Passo 3 — Referenciar no `di.ts` (composition root)
- Adicionar os **11 novos controllers** + **`MetricsController`** ao objeto `export const controllers = { ... }`, com seus services instanciados uma vez.
- Rotas trocam handlers de módulo por `controllers.X` (rotas ficam finas).
- Proibido `new Service/Controller()` em rota/handler (só no di.ts).

## Fases / subagentes (paralelo — arquivos independentes)
- **Fase A — `MetricsController` no di** (rápida, 1 arquivo).
- **Fase B — batch de 3 subagentes:** `AuthController`+`AutomationController` · `GoogleController`+`MetaController`+`InstagramController` · `PlannerController`+`DashboardController`+`BudgetController`.
- **Fase C — batch de 3:** `CampaignsController`+`StudioController` · `SuperAdminController` · (retries).
- Cada subagente: converte service de módulo→classe (se preciso), cria controller-classe, liga no di, deixa rota fina, TDD, `tsc`+build unit verdes, **sem commit** (eu valido/commito centralmente).

## Critério de aceite (por controller)
1. Controller é **`export class XController`**, métodos arrow, recebe services no construtor.
2. Service usado é **classe** (ou repo/externo injetado).
3. Wire no `di.ts` (`controllers.X = new XController(service)`).
4. Rota usa `controllers.X` (cola fina).
5. `tsc --noEmit` + `pnpm run build` + testes da área **verdes**.

## Verificação final
`pnpm build` exit 0 · `vitest` (repos + services + controllers) verde · `tsc` 0 · lint 0 erros · **0 `new Service` em rotas/handlers** · **todos os controllers no di.ts**.