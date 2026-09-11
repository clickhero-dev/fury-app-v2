# Research: 014 — metrics_daily rollup

**Date**: 2026-09-10 | Fonte: leitura do código atual (branch `feat/014-metrics-daily-rollup`, base `origin/hmg`)

## R1 — Como os endpoints funcionam HOJE (o que será substituído)

| Endpoint | Implementação atual | Chamadas Meta |
|---|---|---|
| `GET /metrics/summary` | `MetricsController.getSummary` → `MetricsService` → `DatabaseMetricsProvider.getSummary` (`db-metrics.provider.ts:171`) | 2× (campanhas + insights) |
| `GET /metrics/campaigns` | provider `getCampaigns` (`db-metrics.provider.ts:220`) — lista campanhas + insights, pagina com `slice` em memória | 2× |
| `GET /metrics/daily` | provider `getDailyMetrics` → insights com `time_increment=1` | 1× |
| `GET /metrics/campaigns/:id/insights` e `/adsets` | provider `getCampaignInsights` (`db-metrics.provider.ts:367`) / adsets | 1–2× |
| `GET /campaigns/:id/insights` | `CampaignsService.getCampaignInsights` (`campaigns.service.ts:520`) — **implementação paralela** à do provider | 2× (insights + ads/creatives) |
| `GET /goals/progress` | `GoalService.getProgress` → consome `metrics.getSummary` + `getDailyMetrics` | 2× (indiretas) |

**Decisão R1**: trocar o *backing* do `DatabaseMetricsProvider` (e o trecho de insights de `CampaignsService`) para leitura de `metrics_daily`; contratos HTTP ficam intactos. A implementação paralela de insights será consolidada: `CampaignsService.getCampaignInsights` passa a consumir o mesmo serviço/repository do provider (mantendo o bloco `campaign` e `creatives` live como hoje).

## R2 — Paridade do critério de conversões (FR-011, crítico)

- Conversões: `parseConversionsFromActions(item.actions, objective, item.unique_actions)` — **objective-aware**, aplicada igualmente em summary (`normalizeInsights`) e listagem (`db-metrics.provider.ts:103` e `:522`).
- ROAS: `purchase_roas`; CPA: derivado ou `cost_per_action_type`.
- **Decisão R2**: o job grava `conversions` já normalizado (mesma função), de modo que `SUM(conversions)` de `metrics_daily` reproduza o resumo atual por construção. Teste de paridade: fixture de insights Meta → (a) cálculo atual, (b) caminho novo — assert de igualdade.

## R3 — Schema e migrations (padrão do repo)

- Drizzle em `packages/db/src/schema.ts` + migration SQL manual em `packages/db/migrations/00NN_*.sql` + tag em `packages/db/src/migrate.ts` (última: `0037_policy_tables.sql` → nossa: **0038**).
- RLS: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY ... USING (tenant_id = current_setting('app.current_tenant_id')::uuid)` (padrão `enable_rls.sql`).
- `@fury/db` consome `dist/` → após schema novo: `pnpm build` no packages/db (nota de memory ADR-0001).
- **PK composta** `(tenant_id, campaign_id, date)`: `campaign_id` referencia `campaigns(id)` ON DELETE CASCADE? **Não** — campanhas locais só existem p/ criadas no wizard; insights da Meta podem existir sem linha local. **Decisão R3**: `campaign_meta_id` como `varchar` (id da Meta), **sem FK**, tenant-scoped; índice `(tenant_id, date)` p/ agregações.

## R4 — Worker/agendamento (padrões existentes)

- BullMQ repeatable: `budget-optimizer.worker.ts` usa `repeat: { pattern: '0 6 * * *' }` em queue.add. Nosso job: `pattern: '0 * * * *'`.
- Workers são iniciados em `apps/api/src/index.ts` com `void startXxxWorker().catch(...)` — mesmo padrão p/ `startMetricsSyncWorker()`.
- Lock distribuído: ioredis `SET key NX EX <ttl>` (mesmo Redis do BullMQ, mas **chave própria** `lock:metrics-sync`).
- Idempotência: Drizzle `.onConflictDoUpdate({ target: [t.tenantId, t.campaignMetaId, t.date] })`.

## R5 — On-demand fallback (US3)

- `DatabaseMetricsProvider` ganha camada: leitura → se cobertura do range < necessário e range ≤ 180d → busca Meta (mesmo `getMetaInsights` de hoje) → upsert → re-consulta local.
- Concorrência: lock por tenant (`SET lock:metrics-sync:<tenantId> NX`); se não obter, lê o que existe (não espera) — degrade gracioso.
- `/metrics/*` e `/campaigns/:id/insights` não aceitam range arbitrário maior que 180d hoje (UI limita a 90d) — guarda nossa é cintos + suspensórios.

## R6 — Frontend (FR-012)

- `useCampaigns.ts:65`: `refetchInterval: 30 * 1000` → remover; manter `keepPreviousData` + `staleTime` (60s) e refetch em remount/invalidação.
- Dashboard não muda nesta feature (BFF é feature seguinte); os 4 requests dele passam a ser rápidos (<100ms), a duplicação goals/summary deixa de doer.

## R7 — Riscos

| Risco | Mitigação |
|---|---|
| Paridade de números (conversões/ROAS/CPA) divergir do live | Teste de paridade com fixture real (R2) + fase converge compara telas |
| Insights de campanhas sem linha local (wizard-only) | `campaign_meta_id` sem FK (R3) |
| Job derruba quota se rodar em loop (bug) | Lock + log de chamadas por ciclo + pattern do BullMQ versionado |
| Migration em produção (tabela vazia, sem backfill inicial) | Warmup no startup popula na 1ª execução; opcional: task de backfill manual via disparo do job |
| `@fury/db` stale (dist) | `pnpm build` no packages/db após schema (checklist da task) |

## Open Questions → resolvidos na spec (Decisões Confirmadas)

Frequência 1h · retenção ilimitada · escopo núcleo (sem BFF/criativos) · spec manual · branch off `origin/hmg`.
