# ADR-0003: Coleta e leitura assíncrona dos dados Meta via endpoints v2

**Date**: 2026-09-25
**Status**: accepted
**Deciders**: Diogo (owner), squad Ady

Resumo das decisões e do fluxo implementado: [Sincronização Meta: cache-first e refresh stale](../integrations/meta-sync-cache-first.md).

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
   - `meta_campaign_daily_insights` — valores diários por campanha, para
     períodos históricos sem novas consultas durante o carregamento das telas;
   - `meta_leads` — leads dos formulários (dedupe por `meta_lead_id` + tenant);
   - `meta_instagram_media` — mídia orgânica com insights por media;
   - `meta_sync_runs` — status do run, erro client-safe e contagens.
3. **Insights**: uma consulta lógica account-level
   (`getMetaInsights` com `level=campaign`, `time_range` e `time_increment=1`),
   com paginação até consumir o resultado. Nunca 1 consulta independente por
   campanha. Persistir a série diária por campanha para períodos selecionáveis;
   o snapshot agregado alimenta `snapshots.metrics` e o espelho local
   `campaigns.metrics/lastSyncedAt`. Como a série pode exigir muitas páginas e
   a granularidade útil é D-1, atualizá-la no máximo uma vez por dia; em falha,
   tentar novamente no próximo ciclo.
4. **Leads**: só campanhas `OUTCOME_LEADS` com formulário.
   `campaignHasLeadForm` roda no máximo 1×/campanha (gravado em
   `snapshots.has_lead_form` — evita N+1 nos ciclos seguintes). No 1º ciclo,
   campanhas com `budget.lead_form_id` local + `OUTCOME_LEADS` são tratadas como
   com-form sem chamada extra.
5. **Endpoints v2** (novos, sob `/api/v2`, com `authMiddleware` +
   `tenantMiddleware` iguais aos atuais):

   | Endpoint | Lê de |
   |---|---|
   | `GET /api/v2/campaigns` (+status/limit/offset) | snapshots + insights diários persistidos |
   | `GET /api/v2/campaigns/:id` | snapshot + metrics + syncedAt |
   | `GET /api/v2/campaigns/:id/leads` | `meta_leads` |
   | `GET /api/v2/leads` | `meta_leads` |
   | `GET /api/v2/lead-campaigns` | snapshots (OUTCOME_LEADS c/ form) |
   | `GET /api/v2/metrics/summary` / `daily` / `goals-progress` | snapshots (agregados) |
   | `GET /api/v2/dashboard/instagram-insights` | `meta_instagram_media` |

   Respostas incluem `syncedAt` (quando o snapshot foi coletado), `dataThrough`
   (data mais recente representada nas métricas) e `degraded` quando não há
   snapshot ou ele está há mais de 3 horas sem atualização bem-sucedida. A idade
   de coleta é distinta do atraso normal de publicação das métricas da Meta
   (por exemplo, métricas consolidadas até D-1).
6. **cache-first / degradação graciosa**: toda leitura v2 retorna primeiro o
   que estiver persistido no banco; uma request de tela nunca aguarda chamadas
   externas à Meta. Quando `syncedAt` tem **>3h**, o envelope mantém
   `data`, inclui `degraded=true` e enfileira uma atualização deduplicada por
   tenant (um job stale ativo por tenant, liberado até cinco minutos após
   conclusão). Sem snapshot, responde com coleção vazia + estado de
   primeira sincronização e agenda o bootstrap; não apresenta vazio como
   resultado definitivo. O frontend mantém os dados disponíveis, mostra aviso
   não bloqueante, não troca a tela por skeleton durante refresh e só remove o
   aviso quando uma versão mais nova estiver persistida. Falha Meta mantém o
   snapshot e o aviso; não há chamada direta dos endpoints legados no browser.
7. **Uso resiliente da quota Meta**: a camada comum das chamadas captura os
   headers de uso em sucesso e erro (`X-Business-Use-Case-Usage`, `X-App-Usage`
   e `X-Ad-Account-Usage` quando presentes), extraindo somente métricas
   sanitizadas. Limites são observados por conta/bucket, não por tenant apenas.
   Um limite suspende o fanout restante da conta no run; workers aplicam
   concorrência distribuída limitada, cooldown baseado no tempo de recuperação
   reportado e backoff com jitter quando ele não está disponível. Os códigos e
   subcódigos de throttling são normalizados por tipo; não se presume uma quota
   fixa universal e não se promete ausência total de throttling externo.
8. **Coleta incremental**: leads são persistidos por upsert idempotente e
   checkpoints/cursors por anúncio permitem retomar sem reler todo o histórico
   em cada ciclo. Uma reconciliação integral em cadência menor cobre leads
   atrasados e mudanças na Meta. O resultado diário de insights tem chave única
   tenant + campanha + data para reexecução segura.
9. **Notificação**: falha TOTAL de run envia email para `SYNC_ALERT_EMAILS`
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

### Alternative 2: cron de hora em hora + aviso stale 3h
- **Pros**: menos chamadas Meta.
- **Cons**: aumenta o tempo sem coleta programada e atrasa detecção de falhas.
- **Why not**: manter coleta a cada 15 minutos e usar 3h só como limiar de aviso
  separa a cadência operacional da tolerância de staleness do usuário.

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
- Dados persistidos podem estar defasados; acima de 3h o usuário vê aviso enquanto
  o snapshot anterior permanece disponível.
- A primeira sincronização ainda não tem cache para exibir; a tela mostra estado
  de preparação sem esperar pela Meta.
- A coleta diária de insights aumenta o volume de linhas persistidas e exige
  paginação/checkpoints.

### Risks
- **Rate limit Meta**: observado via headers, controle distribuído por conta,
  parada imediata de fanout e coleta incremental; a quota pode ser compartilhada
  com outras aplicações, então bloqueios externos ainda são possíveis.
- **Multi-pod**: jobId determinístico por tenant/conta+janelamento, lock de
  conta + upserts idempotentes e checkpoints.
- **Refresh assíncrono**: eventual; snapshot anterior fica disponível e o aviso
  permanece se a atualização falhar.
- **Email spam**: dedupe 6h por (tenant, error_code) limita notificações.
