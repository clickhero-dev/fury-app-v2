# Implementation Plan: Pré-processamento de métricas Meta (`metrics_daily` + job de sincronização)

**Branch**: `feat/014-metrics-daily-rollup` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-metrics-daily-rollup/spec.md`

## Summary

Servir as métricas de anúncios (summary, daily, listagem de campanhas, insights de campanha e progresso de metas) de uma tabela pré-processada no Postgres (`metrics_daily`, grão tenant×campanha×dia), sincronizada da Meta Graph API por job BullMQ a cada 1h (com warmup no startup e re-sync de D-0..D-3), com fallback on-demand para lacunas (≤180d). Meta deixa de ser fonte no request path: 0 chamadas Meta por visita, latência <100ms p95.

## Technical Context

**Language/Version**: TypeScript 5.x / Node (ESM) — monorepo pnpm
**Primary Dependencies**: Express, Drizzle ORM, BullMQ (ioredis), Zod, TanStack Query (frontend, só p/ remover polling)
**Storage**: PostgreSQL (PG17) — nova tabela `metrics_daily` + migration SQL versionada; Redis p/ lock do job
**Testing**: Vitest (`npx vitest run <arquivo>`), padrão RED→GREEN→refactor; testes de service com Meta provider mockado (vi.mock de fronteiras)
**Target Platform**: API Node (EasyPanel), web React (Vite) — deploy via Dockerfile/pnpm
**Project Type**: monorepo (apps/api + apps/web + packages/db)
**Performance Goals**: endpoint de métrica <100ms p95 com período recorrente; job: 1 chamada insights/tenant/ciclo (24/tenant/dia)
**Constraints**: contratos HTTP atuais preservados (envelope `ApiResponse<T>`, mesmos campos); critério de conversões idêntico ao atual (paridade Dashboard↔Campanhas); RLS tenant-scoped na tabela nova
**Scale/Scope**: ~200 tenants hoje (até ~2k projetado); retenção ilimitada; sem particionamento até ~100M linhas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como atende |
|---|---|---|
| I. Security & Multi-Tenant Isolation | ✅ | `metrics_daily` com RLS + policy tenant isolation (padrão `enable_rls.sql`/0037); repository tenant-bound; todo acesso escopado por `tenant_id` |
| II. API Contracts & Validation | ✅ | Nenhum contrato novo: mesmos endpoints e envelope; validação Zod existente mantida; sync job valida dados Meta antes de upsert |
| III. Test-First Quality Gates | ✅ | TDD por task (RED→GREEN); testes de unidade para service/job/repository + integração p/ endpoints; bugs/edge cases cobertos (idempotência, falha por tenant, lock) |
| III.Testable Design | ✅ | `MetricsDailyRepository`, `MetaInsightsSyncService` e novos providers como classes com DI no `di.ts`; sem `db` cru em service/controller |
| IV–V (repositório/ADR-0001) | ✅ | Persistência SOMENTE via `MetricsDailyRepository` (extensão de `TenantScopedRepository`); worker é exceção documentada da constituição (workers podem acessar repos, não db cru) |
| VI. Build-Before-Deploy Gate | ✅ | Cada task fecha com `npx vitest run` + `pnpm build` na frente de commit |
| VII. Layer Separation | ✅ | routes → controllers → services → repository; job como worker (camada infra) chamando service de domínio |

## Project Structure

### Documentation (this feature)

```text
specs/014-metrics-daily-rollup/
├── spec.md              # (done — fase specify)
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — padrões do repo e decisões técnicas
├── data-model.md        # Fase 1 — modelo de dados e agregações
├── quickstart.md        # Fase 1 — validação ponta a ponta
├── contracts/           # Fase 1 — contratos HTTP preservados (baseline)
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/db/
├── src/schema.ts                    # + metricsDaily (pgTable, PK composta)
├── migrations/0038_metrics_daily.sql  # tabela + índices + RLS + policy
└── src/migrate.ts                   # + { tag: '0038_metrics_daily' }

apps/api/src/
├── repository/metrics-daily.repository.ts   # NOVO — TenantScopedRepository
├── services/campaigns/metrics-sync.service.ts  # NOVO — orquestra Meta → repository
├── workers/metrics-sync.worker.ts           # NOVO — BullMQ repeatable 1h + warmup + lock Redis
├── lib/providers/db-metrics.provider.ts     # MODIFICADO — lê metrics_daily; on-demand só p/ lacuna
├── lib/providers/mock-metrics.provider.ts   # MODIFICADO — grava/lê metrics_daily p/ paridade dev
├── services/campaigns/campaigns.service.ts  # MODIFICADO — getCampaignInsights lê pré-processado
├── di.ts                                    # + MetricsDailyRepository, MetricsSyncService
└── index.ts                                 # + startMetricsSyncWorker() no startup

apps/web/src/hooks/useCampaigns.ts           # MODIFICADO — remove refetchInterval 30s
```

**Structure Decision**: monorepo existente; tabela nova em `packages/db` (padrão das features anteriores: migration SQL + schema Drizzle + tag no `migrate.ts`); lógica de domínio em `apps/api/src/services` com DI no `di.ts`; worker novo em `workers/` seguindo o padrão `budget-optimizer.worker.ts`.

## Complexity Tracking

> Sem violações de constituição. Decisões que *parecem* complexidade mas são necessárias:
>
> | Decisão | Por quê | Alternativa rejeitada |
> |---|---|---|
> | Upsert idempotente + lock Redis | multi-instância (EasyPanel sobe >1) rodaria o job 2× | "Deixar duplicar" — corrompe paridade e quota |
> | Fallback on-demand no provider | tenant recém-conectado teria tela vazia até 1h | "Só job" — quebra onboarding (US3) |
> | Re-sync D-0..D-3 | Meta revisa insights retroativos | "Só D-1" — números retroativos errados permanentemente |
