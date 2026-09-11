# Tasks: 014 — metrics_daily rollup

**Branch**: `feat/014-metrics-daily-rollup` | Estratégia: TDD por task (RED→GREEN), commits por frente com pathspec explícito (`git add -p`/pathspec, nunca `-A`).

Ordem de dependência: T1 (dados) → T2 (repository) → T3 (service) → T4 (worker) → T5 (provider/endpoints) → T6 (insights campanha) → T7 (goals) → T8 (frontend) → T9 (converge).

---

## T1 — Tabela `metrics_daily` (migration + schema) `~45min`

1. `packages/db/migrations/0038_metrics_daily.sql` — SQL de data-model.md (tabela, PK composta, índice, RLS+policy), tag `0038_metrics_daily` em `packages/db/src/migrate.ts`.
2. `packages/db/src/schema.ts` — `metricsDaily` pgTable (Drizzle, data-model.md).
3. `pnpm --filter @fury/db build` (dist p/ @fury/db).
4. **Teste** `packages/db/src/__tests__/metrics-daily.schema.test.ts`: tabela existe com PK/índices/RLS (query pg_catalog) — RED antes da migration.
5. Rodar: `pnpm --filter @fury/db migrate` → GREEN.
6. Commit: `feat(db): tabela metrics_daily p/ rollup diário de insights (0038)`.

## T2 — `MetricsDailyRepository` `~45min`

1. **Teste** `apps/api/src/__tests__/metrics-daily.repository.test.ts` (RED): upsert em lote idempotente (2× → contagem estável, valores atualizados), `getRange(tenant, start, end)`, `getDailyByCampaign(tenant, campaignMetaId, start, end)`, `getCoverage(tenant)` (min/max date), escopo por tenant (linha de outro tenant invisível), operações retornam números (não string numeric).
2. `apps/api/src/repository/metrics-daily.repository.ts` — extends `TenantScopedRepository`; Drizzle `.onConflictDoUpdate`.
3. `npx vitest run` → GREEN. Commit: `feat(api): MetricsDailyRepository tenant-bound (upsert idempotente)`.

## T3 — `MetaInsightsSyncService` (Meta → metrics_daily) `~1h30`

1. **Teste** `apps/api/src/__tests__/metrics-sync.service.test.ts` (RED) com provider Meta mockado:
   - happy: 1 tenant c/ insights → upsert D-0..D-3, 1 call insights + 1 call lista campanhas (status/nome);
   - conversões normalizadas com MESMO critério (fixture com actions objective-aware) — paridade R2;
   - tenant sem conexão → pulado, sem throw; tenant com erro → outros tenant prosseguem (FR-005);
   - campanha sem linha local → linha gravada (campaign_meta_id sem FK).
2. `apps/api/src/services/campaigns/metrics-sync.service.ts` — classe com DI (repo + provider Meta + logger); orquestra fetch (level=campaign, time_increment=1, D-0..D-3) → normaliza → upsert lote.
3. GREEN. Commit: `feat(api): MetaInsightsSyncService — sincroniza insights p/ metrics_daily`.

## T4 — Worker BullMQ (cron 1h + warmup + lock) `~1h30`

1. **Teste** `apps/api/src/__tests__/metrics-sync.worker.test.ts` (RED):
   - agenda repeatable pattern `0 * * * *`;
   - lock Redis: 2ª execução simultânea pula (SET NX EX);
   - warmup `startMetricsSyncWorker({ warmup: true })` dispara sync em background;
   - falha de ciclo não derruba agendador.
2. `apps/api/src/workers/metrics-sync.worker.ts` — padrão `budget-optimizer.worker.ts`; lock `lock:metrics-sync` TTL ~50min; logs de tenants/linhas/chamadas.
3. `apps/api/src/index.ts` — `void startMetricsSyncWorker()` junto dos outros workers.
4. `apps/api/src/di.ts` — registra `MetricsDailyRepository` + `MetricsSyncService`.
5. GREEN. Commit: `feat(api): worker metrics-sync (1h, warmup, lock Redis)`.

## T5 — Endpoints `/metrics/*` lendo do rollup `~2h`

1. **Teste** `apps/api/src/__tests__/metrics-provider-parity.test.ts` (RED): fixture insights Meta → (a) caminho live atual, (b) novo caminho SQL — summary/daily/campaigns com MESMOS números (paridade R2/T3). Edge: tenant sem dados → zeros; range sem cobertura ≤180d → on-demand busca Meta, upserta e responde; range >180d → só local; 2ª consulta sem on-demand.
2. `apps/api/src/lib/providers/db-metrics.provider.ts` — leitura via `MetricsDailyRepository`; fallback on-demand com lock por tenant (R5); status de campanha segue live (lista leve) conforme data-model.
3. GREEN + `npx vitest run apps/api/src/__tests__/` (sem regressão: campaigns-service, rate-limit etc.).
4. Commit: `feat(api): /metrics/* servidos de metrics_daily (+fallback on-demand)`.

## T6 — `GET /campaigns/:id/insights` do rollup `~1h`

1. **Teste** `apps/api/src/__tests__/campaigns-insights-parity.test.ts` (RED): timeseries 7/30/90d idêntica ao cálculo atual (fixture); `campaign` e `creatives` mantêm comportamento live; campanha sem dados → timeseries vazia sem erro.
2. `apps/api/src/services/campaigns/campaigns.service.ts` — `getCampaignInsights` usa repository (consolidação R1); creatives seguem como hoje.
3. GREEN. Commit: `feat(api): insights de campanha lidos de metrics_daily`.

## T7 — `/goals/progress` do rollup `~45min`

1. **Teste** `apps/api/src/__tests__/goals-progress-parity.test.ts` (RED): sparks/ideal_line/projeção idênticos ao atual com fixture; sem Meta → zeros (comportamento atual preservado).
2. `apps/api/src/services/goals/goal.service.ts` — nada muda na assinatura; provider já é novo (T5). Só validar/teste de regressão do fluxo completo.
3. GREEN. Commit: `test(api): paridade /goals/progress com metrics_daily`.

## T8 — Frontend: remove polling 30s `~15min`

1. **Teste** `apps/web/src/pages/campanhas/PainelCampanhas.test.tsx` (ajuste, RED): `useCampaigns` sem refetchInterval; refetch ao remount/troca período.
2. `apps/web/src/hooks/useCampaigns.ts` — remover `refetchInterval: 30_000` (manter keepPreviousData/staleTime).
3. GREEN. Commit: `feat(web): remove polling 30s de campanhas (dado via metrics_daily)`.

## T9 — Converge `~1h`

1. `pnpm run lint && pnpm run test && pnpm run build` (gate VI).
2. Paridade manual com Meta real (quickstart checklist) — screenshots de números.
3. Verificação `specs/014-metrics-daily-rollup/` completa; tasks.md atualizado; commits listados.
4. Resumo final: o que mudou, evidências, pendências (BFF/criativos = próximas features).
