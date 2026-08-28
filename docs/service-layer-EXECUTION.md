# Guia de Execução — Refatoração da Camada de Service

**Branch:** `feat/service-layer-planning` (planejamento) → **implementação em outra branch.**
**Público:** desenvolvedor que vai implementar a refatoração **sozinho**, sem depender de contexto
adicional. **Leia primeiro:** `docs/service-layer-refactor.md` (guia/contrato) e `docs/service-layer-map.md` (mapa).

> Este arquivo é o **"como executar"**: setup, definição de pronto (DoD), e quebra de tarefas
> por fase com especificações concretas (arquivos, assinaturas, DI, critérios de aceite).

---

## 1. Setup e comandos

```bash
# Do repositório fury-app-v2
git checkout dev            # base de trabalho
git pull origin dev
git checkout -b feat/xxx    # sua branch de implementação (outra branch!)

# Dependências e builds
pnpm install                # (lockfile compartilhado)
cd apps/api && pnpm run build        # tsc — deve sair 0
pnpm exec vitest run        # testes — sem regressão
cd apps/web && pnpm run build        # se mexer no front
```

**Regra:** nunca quebrar `pnpm run build` (apps/api) nem a regressão de testes. Por domínio.

---

## 2. Definição de Pronto (DoD) — por fase/conjunto de PRs

Para cada serviço-classe entregue, TODOS abaixo devem valer:
- [ ] Negócio saiu de `routes/*` e (se existia) de `controllers/*` → `services/<dominio>/<Nome>.service.ts`.
- [ ] Service é **classe** `export class <Nome>Service`, métodos recebem `(tenantId, input)`.
- [ ] Dependências (repos + externos) vêm do **construtor** (factories quando repo é por-tenant).
- [ ] Zero `import` de `express`/`req`/`res` no service.
- [ ] Rota ficou fina: `router.get('/x', controllers.<nome>.<metodo>)`.
- [ ] Controller é glue fino (parse/validação/chama service/serialização/`next(err)`); não faz `new <Service>()`.
- [ ] Erros do service usam `AppError`; controller repassa com `next(error)`.
- [ ] `apps/api` `pnpm run build` exit 0 e vitest do domínio verde.
- [ ] Sem `db.*`/repos diretos nas rotas do domínio.
- [ ] PR descritiva (o que/porquê) + referência ao ticket.

---

## 3. Padrão de DI (o que o dev segue)

- **Composition root** = `apps/api/src/di.ts` (novo): instancia `repositories`, `externals`,
  `services`, `controllers` uma única vez; exporta os singletons que as rotas importam.
- **Repo por-tenant:** service recebe uma **factory** no construtor:
  `(tenantId: string) => Repo` (default = `new Repo(tenantId)`). No método: `const repo = this.repoFactory(tenantId)`.
- **Externo (provider/llm/storage/email/asaas):** singleton injetado no construtor (és por-call por tenant).

```ts
// services/goals/goal.service.ts
type GoalsRepo = Pick<CampaignRepository, 'findClientGoal'|'upsertClientGoal'|'updateClientGoal'|'findCampaigns'>;
export class GoalService {
  constructor(
    private metrics: MetricsProvider,
    private repoFactory: (t: string) => GoalsRepo = (t) => new CampaignRepository(t),
  ) {}
  private repo(t: string): GoalsRepo { return this.repoFactory(t); }
  async getGoal(tenantId: string) { /* ... */ }
  async upsertGoal(tenantId: string, input: GoalInput) { /* ... */ }
  async updateGoal(tenantId: string, input: GoalInput) { /* ... */ }
  async getProgress(tenantId: string, range?: { start?: string; end?: string }) { /* ... */ }
}
```

---

## 4. TDD (como testar cada service-classe)

O service é puro → testa só com mocks dos dependentes.

```ts
// __tests__/goal.service.test.ts
const mockRepo = { findClientGoal: vi.fn(), upsertClientGoal: vi.fn(), updateClientGoal: vi.fn(), findCampaigns: vi.fn() };
const mockMetrics = { getSummary: vi.fn(), getDailyMetrics: vi.fn() };
const svc = new GoalService(mockMetrics as any, () => mockRepo as any);
// cases: getGoal (null/row), upsert (new/existing), update (no-row→null), getProgress
//   (sem Meta→zeros; roas/conv/budget projeção; alertas cpa_high/roas_low; período custom)
```
Critério: cada função de negócio tem caso unitário; mui fácil de alcançar porque o service não toca HTTP.

---

## 5. Quebra de tarefas por fase (implementáveis independentes)

### Fase 0 — Fundação (padrão + `di.ts` + POC Goals)
**Objetivo:** deixar o padrão pronto e provado.
- Criar `apps/api/src/di.ts` (composition root) com `goals` já funcionando.
- Adicionar em `base.repository.ts` (ou repo de goals): métodos de escrita de `clientGoals`
  (`upsertClientGoal`, `updateClientGoal` — update por tenant na existente, insert se não).
- Criar `services/goals/goal.service.ts`, `controllers/goal.controller.ts`.
- Afinar `routes/goals.routes.ts` (rota fina).
- Criar `__tests__/goal.service.test.ts`.
- **Dependências:** `CampaignRepository` (base lookups + findCampaigns) + `MetricsProvider`.
- **Aceite:** doje em Fase 1 coincide (Goals entregue completo).

### Fase 1 — Goals (maior vazamento — `goals.routes.ts` 445 ln)
**Extrair p/ `GoalService`:**
- `getGoal` (GET `/goals`) — hoje `db.query.clientGoals` direto.
- `upsertGoal` (POST `/setup`) — hoje upsert direto.
- `updateGoal` (PUT `/`) — hoje update direto (retorna null se não há goal).
- `getProgress` (GET `/progress`) — ~250 ln de projeção (conv/orçamento/ROAS), ideal×real,
  alertas de campanha, tolerância "sem Meta → zeros". Usa `MetricsProvider` (getSummary/getDailyMetrics) + `CampaignRepository` (goals + campaigns).
- Helpers do arquivo (`daysInMonth`, `endOfMonth`, `getStatus`, `calcProgressPercent`, `serializeGoal`, money/parse) movem para o service (privados).
- `goals.routes.ts` vira fina; `goal.controller.ts` cria.
- **Aceite:** `pnpm run build` exit 0 · `goal.service.test` verde · `routes/goals.routes.ts` sem `db`/pro-cão inline.

### Fase 2 — BrandKit (`brand-kit.routes.ts` 219 ln · 🟥 · `db` direto)
- `services/brand-kit/brand-kit.service.ts` (`get`, `upsert`, `uploadLogo`, `uploadPhotos`, `removePhotos`).
- Dependências: repo (base/brandKits) + `storageService`.
- `brand-kit.controller.ts` fina; rota fina; `brand-kit.service.test.ts`.

### Fase 3 — FuryEngine (`fury.routes.ts` 213 ln · 🟥)
- `services/llms/fury-engine.service.ts` → classe (já existe como funções): `getConfig/updateConfig`,
  `listRules/createRule/updateRule/deleteRule`, `getScores`, `getHistory`, `liveFeed`.
- Dependências: `FuryEngineRepository`, `CampaignRepository`, llm client (Anthropic).
- `fury.controller.ts`; rota fina; testes (config/rules/scores/history).

### Fase 4 — Studio + OpenRouter (as duas maiores · `studio` 806 + `openrouter` 518)
- `services/studio/studio.service.ts` → classe (`listAssets/createAsset/*`, `generateCreative`, `regenerateCreative`, `validateContext`, publish/upload-meta).
- `services/studio/openrouter-studio.service.ts` (geração FLUX/imagem/vídeo, regen-ad, edit).
- Dependências: `StudioRepository`, `PlannerRepository`, `SubscriptionRepository`(quota) +
  `openrouterService`, `storageService`, `complianceQueue`.
- `studio.controller.ts`/`openrouter.controller.ts`; rotas finas; testes (mock openrouter/storage).

### Fase 5 — Billing (`billing.routes.ts` 276 ln · 🟨)
- `services/billing/billing.service.ts` (`listPlans`, `handleWebhook`, `subscribe`, `getSubscription`, `listInvoices`, `cancel`).
- Dependências: `SubscriptionRepository` + `AsaasService` + `emailService` + `MetricsProvider`(se usar).
- `billing.controller.ts`; rota fina; testes (webhook Asaas, assinatura/trial).

### Fase 6 — Conversão dos services-função → classes (DI)
Dominios: **Meta, Instagram, Google, Planner(+PlannerStudio/Context), Auth(+Social), Forms, Automation**.
- Transformar `export const X = () => {}` em `export class XService { constructor(repos, externos) }`.
- Absorver `DefaultCampaignRepository`/`ICampaignRepository` no `CampaignsService`.
- `di.ts` passa a montar todos; rotas/controllers usam os singletons.
- Ajustar `controllers/*` p/ receber o service no construtor.
- **Atenção:** mudança de assinatura em massa → fazer por domínio, regressão verde a cada passo.

### Fase 7 — Observability (raw-SQL GLOBAL · `observability.routes.ts` 223 ln)
- `services/observability/observability.service.ts` (query catalog + runner GLOBAL).
- `observability.controller.ts`; rota fina; `observability.service.test.ts` (mock db/raw SQL).

---

## 6. Ordem recomendada de PRs
1. `feat/service-layer-0-foundation` — `di.ts` + base clientGoals write + **Goals** (Fases 0+1 juntas).
2. `feat/service-layer-brandkit`
3. `feat/service-layer-furyengine`
4. `feat/service-layer-studio-openrouter`
5. `feat/service-layer-billing`
6. `feat/service-layer-class-conversion` (Meta/Google/Planner/Auth/Forms/Automation + Campaigns DE)
7. `feat/service-layer-observability`

> Ao final, **todas as rotas ficam finas** (🟩): maps mostram estado inicial 🟥→🟩.

---

*Gerado em 2026-08-27 — branch de planejamento `feat/service-layer-planning`.*