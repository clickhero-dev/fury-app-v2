# ADR-0003: Coleta e leitura assíncrona dos dados Meta via endpoints v2

**Date**: 2026-09-25
**Status**: accepted
**Deciders**: Diogo (owner), squad Ady

## Context

Os endpoints atuais de dados Meta (`/campaigns`, `/metrics/*`, `/campaigns/leads`,
`/campaigns/lead-campaigns`, `/dashboard/instagram-insights`) consultam a Meta
Graph API ao vivo a cada request, com cache HTTP curto (300s). Consequências:

- latência alta para o usuário (N+1 em leads, insights e Instagram);
- campanhas criadas fora do Fury nunca entram na listagem local;
- `campaigns.metrics` / `campaigns.lastSyncedAt` nunca são gravados;
- não existe sincronização periódica Meta → o painel depende sempre da Meta.

Decidimos mover a coleta para um **pipeline assíncrono** que persiste os dados
em tabelas próprias e expõe **endpoints novos (v2)** que leem do banco. Os
endpoints atuais permanecem intactos; a reversão é só voltar o path no front.

## Decision

1. **Coleta assíncrona**: job BullMQ `meta-sync` roda no startup (bootstrap) e
   em cron a cada **15 minutos** (`*/15 * * * *`), processando um run por tenant.
   `jobId` determinístico por `tenant + ciclo de 15min` para dedupe multi-pod.
2. **Persistência** (ADR-0001): tabelas novas tenant-bound com upserts
   idempotentes (`ON CONFLICT`):
   - `meta_campaign_snapshots` — todas as campanhas da conta Meta (inclui fora
     do Fury), com `budget`, `metrics`, `has_lead_form`, `last_insights_at`;
   - `meta_leads` — leads dos formulários (dedupe por `meta_lead_id` + tenant);
   - `meta_instagram_media` — mídia orgânica com insights por media;
   - `meta_sync_runs` — status do run, erro client-safe e contagens.
3. **Insights**: 1 chamada account-level por tenant por ciclo
   (`getMetaInsights` com `level=campaign` + `time_range` 30d) — nunca 1 por
   campanha. O resultado alimenta `snapshots.metrics` e o espelho local
   `campaigns.metrics/lastSyncedAt`.
4. **Leads**: só campanhas `OUTCOME_LEADS` com formulário.
   `campaignHasLeadForm` roda no máximo 1×/campanha (gravado em
   `snapshots.has_lead_form` — evita N+1 nos ciclos seguintes). No 1º ciclo,
   campanhas com `budget.lead_form_id` local + `OUTCOME_LEADS` são tratadas como
   com-form sem chamada extra.
5. **Endpoints v2** (novos, sob `/api/v2`, com `authMiddleware` +
   `tenantMiddleware` iguais aos atuais):

   | Endpoint | Lê de |
   |---|---|
   | `GET /api/v2/campaigns` (+status/limit/offset) | `meta_campaign_snapshots` |
   | `GET /api/v2/campaigns/:id` | snapshot + metrics + syncedAt |
   | `GET /api/v2/campaigns/:id/leads` | `meta_leads` |
   | `GET /api/v2/leads` | `meta_leads` |
   | `GET /api/v2/lead-campaigns` | snapshots (OUTCOME_LEADS c/ form) |
   | `GET /api/v2/metrics/summary` / `daily` / `goals-progress` | snapshots (agregados) |
   | `GET /api/v2/dashboard/instagram-insights` | `meta_instagram_media` |

   Toda resposta inclui `syncedAt` (idade do dado) e `partial_failures` quando
   o sync inline teve falhas parciais.
6. **Staleness / fallback**: dado é considerado stale quando **>15min** desde o
   último run de sucesso (ou sem dados). Nesse caso o endpoint v2 dispara um
   sync inline (aguardado, com timeout via wrapper ADR-0002), persiste e retorna
   o dado fresco. Meta fora e sem dados no banco → `502 META_API_ERROR`
   (nunca 500 silencioso).
7. **Notificação**: falha TOTAL de run envia email para `SYNC_ALERT_EMAILS`
   (default `diogommtdes@gmail.com;diogo.souza@clickhero.com.br`, env var
   sobrepõe) com template `syncFailureEmailTemplate` (mensagem client-safe,
   sem token/payload/stack), com **dedupe de 6h por `(tenant, error_code)`**
   via Redis `SET NX EX 21600`. Sucesso não gera email. Falha parcial
   (`partial_failures`) não gera email.

## Alternatives Considered

### Alternative 1: manter leitura ao vivo com cache HTTP
- **Pros**: sem tabelas novas; dado sempre "fresco".
- **Cons**: latência alta (N+1), dependência da Meta em todo request,
  campanhas fora do Fury nunca entram, sem histórico/offline.
- **Why not**: não resolve o problema de latência nem o gap de sincronização.

### Alternative 2: cron de hora em hora + stale 15min
- **Pros**: menos chamadas Meta.
- **Cons**: ~75% das leituras cairiam no fallback ao vivo (o dado só é fresco
  por 15min após cada ciclo horário) — o pipeline quase não alivia a espera.
- **Why not**: decisão D7 fixou stale em 15min; o cron `*/15` casa com isso.

### Alternative 3: escrever nas tabelas `campaigns`/`metrics` existentes
- **Pros**: sem tabelas novas.
- **Cons**: acopla o snapshot à entidade de negócio, perde campanhas externas,
  mistura dados de origem (Meta ao vivo vs. banco) sem rastreio.
- **Why not**: tabelas dedicadas dão rastreabilidade (`meta_sync_runs`) e
  isolamento.

## Consequences

### Positive
- Dashboard, campanhas e leads lêem do banco (ms) na maioria dos requests.
- Campanhas criadas fora do Fury entram na listagem v2.
- `campaigns.metrics` / `lastSyncedAt` passam a ser gravados pelo sync.
- Falha parcial de 1 campanha não derruba o restante (ADR-0002).
- Reversão trivial: trocar o path no front para os endpoints antigos.

### Negative
- Dado pode ter até ~15min de idade (staleness), exigindo o fallback inline.
- Volume de leads exige paginação e janela de coleta definida por ciclo.
- `metrics/daily` v2 é estimativa a partir dos agregados 30d dos snapshots
  (não há série diária persistida ainda).

### Risks
- **Rate limit Meta**: mitigado com insights account-level (1 chamada/ciclo) e
  `has_lead_form` cacheado no snapshot (N+1 só no 1º ciclo).
- **Multi-pod**: jobId determinístico por tenant+ciclo + upserts idempotentes.
- **Sync inline stale** pode levar segundos na 1ª carga — limitado pelo timeout
  do wrapper (nunca trava o request além disso).
- **Email spam**: dedupe 6h por (tenant, error_code) limita notificações.