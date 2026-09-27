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
   `snapshots.has_lead_form` é tri-state: `true`/`false` representam resultado
   conhecido e `NULL` representa ainda não verificado. `campaignHasLeadForm`
   roda no máximo 1× por campanha depois de um resultado conhecido. No 1º ciclo,
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
   último run de sucesso (ou sem dados). Rotas de campanhas e dashboard mantêm o
   fallback inline existente. Rotas de leads servem imediatamente o snapshot
   persistido quando disponível e enfileiram um sync em segundo plano (stale
   while revalidate), sem aguardar a Meta. Sem snapshots de campanha, permanece
   o fallback inline para popular o primeiro conjunto de dados. Meta fora e sem
   dados no banco → `502 META_API_ERROR` (nunca 500 silencioso).
7. **Notificação**: falha TOTAL de run envia email para `SYNC_ALERT_EMAILS`
   (default `diogommtdes@gmail.com;diogo.souza@clickhero.com.br`, env var
   sobrepõe) com template `syncFailureEmailTemplate` (mensagem client-safe,
   sem token/payload/stack), com **dedupe de 6h por `(tenant, error_code)`**
   via Redis `SET NX EX 21600`. Sucesso não gera email. Falha parcial
   (`partial_failures`) não gera email.

## Implementation Decisions (2026-09-26)

Durante a validação local da conta Meta usada no fluxo de clientes, foram
registradas estas decisões para tornar a coleta recuperável e as leituras
rápidas:

1. **Não tratar desconhecido como sem formulário**: `has_lead_form` não recebe
   default `false`. A migração `0044_meta_lead_form_unknown.sql` converte os
   falsos antigos, que não tinham sido verificados de forma confiável, para
   `NULL`. Assim o sync consulta a Meta em vez de descartar leads de campanhas
   recém descobertas.
2. **Preservar os dados conhecidos antes de gastar quota**: campanhas
   `OUTCOME_LEADS` cujo formulário já é conhecido como presente são processadas
   antes das campanhas ainda desconhecidas. Uma resposta Meta de rate limit
   (códigos 4 ou 17) encerra a coleta de leads daquele run e é registrada como
   falha parcial `META_RATE_LIMIT`; as próximas campanhas não geram chamadas
   repetidas que já estão destinadas a falhar.
3. **Usar campos suportados pela Graph API**: a verificação de formulário usa
   `creative{object_story_spec}`. O campo `creative{link_data}` foi removido
   porque a API rejeita esse campo nessa consulta.
4. **Manter dedupe BullMQ sem dois-pontos**: os IDs determinísticos dos jobs
   usam hífens no lugar de `:`. A deduplicação por tenant e janela de 15 minutos
   permanece, respeitando a restrição de formato do BullMQ.
5. **Leitura stale rápida para Clientes**: `/api/v2/lead-campaigns` e
   `/api/v2/leads` não bloqueiam a tela pelo sync Meta quando já existe snapshot.
   As rotas retornam os dados salvos e enfileiram a atualização; o dedupe do job
   evita duplicar o refresh quando a tela consulta as duas rotas em paralelo.

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
- Dados stale podem ser exibidos enquanto a atualização em segundo plano termina;
  a tela de Clientes prioriza resposta rápida sobre esperar frescor da Meta.
- Volume de leads exige paginação e janela de coleta definida por ciclo.
- `metrics/daily` v2 é estimativa a partir dos agregados 30d dos snapshots
  (não há série diária persistida ainda).

### Risks
- **Rate limit Meta**: mitigado com insights account-level (1 chamada/ciclo) e
  `has_lead_form` cacheado no snapshot (N+1 só no 1º ciclo).
- **Multi-pod**: jobId determinístico por tenant+ciclo + upserts idempotentes.
- **Primeira carga sem snapshots** ainda pode usar sync inline e levar segundos;
  permanece limitada pelo timeout do wrapper ADR-0002.
- **Rate limit durante a coleta de leads** pode deixar campanhas desconhecidas
  sem verificar naquele ciclo; elas serão retomadas em um ciclo posterior sem
  repetir chamadas no mesmo run após a resposta de limite.
- **Email spam**: dedupe 6h por (tenant, error_code) limita notificações.
