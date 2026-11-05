# Planejamento — Execuções pendentes (deep-DI + absorção + entrega)

**Branch:** `feat/service-layer-planning` · **Status:** Atualizado 2026-08-27
**Prancha:** o core (Fases 0–7) está pronto; faltam as execuções abaixo.

---
## ✅ Já feito (contexto)
- Fases 0–7 (routes finas + services-classe + `di.ts`) · `134/134` testes · build exit 0.
- Deep-DI **POC** no `AuthService` (`ffc9d38`): repoFactory + jwt/email no construtor.

## ⏳ Pendências (pipeline)
1. **Deep-DI restante nas classes da Fase 6** (hoje métodos *bound*, criam repo/externo inline).
2. **Deep-DI de "externos"** em serviços que ainda importam diretamente (storage/quota/openrouter/deepseek/email) quando fizer sentido.
3. **Absorver** `DefaultCampaignRepository`/`ICampaignRepository` → `CampaignsService`.
4. **Integração & entrega**: build+tests+lint verdes → atualizar docs/mapa → PR da branch.

---

## 0. Padrão de deep-DI (template — já provado no AuthService)
```ts
export class XService {
  constructor(
    private repoFactory: (t: string) => XRepository = (t) => new XRepository(t),
    private deps: { /* serviços externos */ } = { /* defaults reais */ },
  ) {}
  private repo(t) { return this.repoFactory(t); }
  async metodo(tenantId, ...) {
    // usa this.repo(tenantId) e this.deps.* — SEM `new XRepository(...)` inline
  }
}
export const xService = new XService();
```
**Critério de aceite por serviço:** trocar TODO `new XRepository(...)` interno por `this.repo(...)`; externos por `this.deps.*`; atualizar o singleton em `di.ts` se preciso; **TDD** (teste unitário com repo/deps mockados); `tsc` + `pnpm run build` + regressão verdes; commit por serviço.

---

## 1. Deep-DI restante — breakdown por serviço (paralelizável)

| # | Serviço | Escopo (métodos) | Externos a injetar | Complexidade |
|---|---|---|---|---|
| 1A | `SocialAuthService` (`services/core/social-auth.service.ts`) | 3 | jwt, google-oauth, ID token | ✅ baixa |
| 1B | `GoogleService` (`services/google/google.service.ts`) | 19 | google-api, storage | 🔴 alta |
| 1C | `PlannerService` (`services/planner/planner.service.ts`) | 20 (+PlannerStudio/Context) | deepseek/openrouter, storage | 🔴 alta |
| 1D | `MetaService` (`services/meta/meta.service.ts`) + `InstagramService` | 16 | meta-api, openrouter | 🟠 média-alta |

> **Todas usam o mesmo template (0).** São independentes entre si → **paralelizar com subagentes**.

### Execução com subagentes (batch de 3 — `delegation.max_concurrent_children=3`)
- **Batch 1 (paralelo):** `1B Google` · `1C Planner` · `1D Meta` — cada um um subagente isolado.
- **Batch 2 (paralelo):** `1A SocialAuth` + qualquer retry/rebote dos batch 1.
- Cada subagente: objetivo autossuficiente (arquivos, template, externos, TDD, build, commit), sem depender do contexto da conversa.

---

## 2. Deep-DI de "externos" (opcional, menor prioridade)
Injetar nos construtores serviços que hoje fazem `import` direto em arquivos de outras Fases quando não houver `di.ts` já cobrindo:
- `BrandKitService` (storage) ✅ já injeta · `GoalService` (metrics) ✅ já injeta · `OpenRouterStudioService` (llm+quota) ✅ já injeta.
- Pendentes: `StudioService` (+ openrouter/deepseek/storage), `FuryEngineService` (+ Anthropic), `BillingService` (+ asaas/email) → avaliar caso a caso; nem sempre vale injetar se for só 1 uso estático.

## 3. Absorver DefaultCampaignRepository → CampaignsService
- Migrar as consultas de `lib/providers/default-campaign.repository.ts` para `CampaignRepository` (ou o `CampaignsService` usar `CampaignRepository` injetado) e remover o `ICampaignRepository`/`MockCampaignRepository` (ajustando `campaigns-service.test.ts`).
- **Depois do deep-DI (item 1)**, pois mexe no mesmo domain de repositório.

## 4. Integração & entrega
1. `pnpm run build` + `pnpm exec vitest run` → 0 falhas.
2. Atualizar `docs/service-layer-EXECUTION.md` + mapa (fases/DI concluídos).
3. **PR** `feat/service-layer-planning` → revisão (base a confirmar: `hmg` ou `dev`).
4. Atualizar o **grafo** (MCP code-review-graph) ao final.

---

## Ordem recomendada
```
1 (paralelo: Google, Planner, Meta)  →  1 (SocialAuth)  →  3 (absorção)  →  2 (externos, se fizer)  →  4 (entrega)
```
Fica também registrado em `docs/service-layer-EXECUTION.md` (seção de continuação).