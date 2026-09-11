# Quickstart: 014 — validação ponta a ponta

## Setup local

1. Postgres local `localhost:5432/fury_dev`; Redis local `:6379`.
2. `pnpm install`; env `.env` da API com `META_API_MOCK=true` (mock, sem token real) ou token de teste.

## Rodar a feature

```bash
# 1. build do db (necessário após schema novo)
pnpm --filter @fury/db build

# 2. migration
pnpm --filter @fury/db migrate   # aplica 0038_metrics_daily

# 3. testes da feature
npx vitest run apps/api/src/__tests__/metrics-daily.repository.test.ts
npx vitest run apps/api/src/__tests__/metrics-sync.service.test.ts
npx vitest run apps/api/src/__tests__/metrics-sync.worker.test.ts
npx vitest run apps/api/src/__tests__/metrics-provider-parity.test.ts

# 4. API + manual
pnpm --filter @fury/api dev
# - startup loga "metrics sync warmup" e popula metrics_daily (mock/live)
# - abrir /dashboard e /campanhas: dados iguais aos de hoje
# - trocar filtro de data: resposta <100ms
```

## Checklist de paridade (converge)

1. `/metrics/summary` — mesmo número de hoje (mesmo tenant/período) com Meta real.
2. `/campanhas` — Total Clientes = resumo do Dashboard (soma ACTIVE+PAUSED).
3. `/campanhas/insights/:id` — aba 7/30/90d idêntica ao live de hoje.
4. `metrics_daily` — 2 execuções do job seguidas: contagem de linhas estável.
5. Tenant sem Meta — job pula, telas vazias sem erro.
6. Remover polling 30s — tela de campanhas continua atualizando ao voltar/trocar período.

## Criterios de aceite (da spec)

- SC-001: 0 chamadas Meta no request path (verificar logs de metaApiCall durante requests).
- SC-002: ~24 calls/tenant/dia (log do job).
- SC-004: idempotência (teste).
- SC-005: polling removido (código + UX).
