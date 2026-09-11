# Feature Specification: Pré-processamento de métricas Meta (`metrics_daily` + job de sincronização)

**Feature Branch**: `feat/014-metrics-daily-rollup`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: estudo de carregamento das páginas Dashboard, Campanhas e Insights da campanha; pré-processar dados de anúncios em tabela diária no Postgres, sincronizados da Meta API por job BullMQ, e servir os endpoints de métricas a partir dela.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Métricas servidas do pré-processado (Priority: P1)

Como **usuário do Dashboard/Campanhas/Insights**, quero que as métricas de anúncios carreguem rápido, porque hoje cada visita busca tudo na Meta API em tempo real (7–10 chamadas por visita no Dashboard; polling de 30s em Campanhas ≈ 240 chamadas/h), tornando o carregamento lento e consumindo quota.

**Why this priority**: é o ganho central da feature. Sem os endpoints lendo do pré-processado, o job não entrega valor nenhum.

**Independent Test**: com `metrics_daily` populada para um tenant, desligar acesso à Meta (token inválido/timeout simulado) e confirmar que `GET /metrics/summary`, `GET /metrics/campaigns`, `GET /metrics/daily` e `GET /campaigns/:id/insights` respondem com dados corretos do Postgres. Entrega valor sozinho: as telas ficam rápidas.

**Acceptance Scenarios**:

1. **Given** tenant com `metrics_daily` populada para o período, **When** `GET /metrics/summary?startDate&endDate`, **Then** resposta equivalente ao cálculo atual (spend, conversions, roas, cpa) em <100ms p95, sem chamada à Meta.
2. **Given** tenant com dados diários, **When** `GET /metrics/daily?startDate&endDate`, **Then** série diária agregada por campanha no período, mesma forma de resposta de hoje.
3. **Given** tenant com dados diários, **When** `GET /metrics/campaigns?limit=100&startDate&endDate`, **Then** lista de campanhas com métricas do período + paginação idêntica à atual (total, page, limit).
4. **Given** campanha com série diária no período, **When** `GET /campaigns/:id/insights?date_range=last_7d|last_30d|last_90d`, **Then** `timeseries` e totais servidos do Postgres (o bloco `campaign` e os `creatives` mantêm comportamento atual — criativos seguem live nesta feature, ver Assumptions).
5. **Given** `/goals/progress`, **When** consultado, **Then** continua funcionando consumindo summary/daily já servidos do pré-processado (mesma resposta de hoje).

---

### User Story 2 - Job de sincronização horária (Priority: P1)

Como **sistema**, preciso sincronizar insights da Meta para `metrics_daily` a cada 1h, porque o pré-processado só tem valor se estiver atualizado — e o custo precisa ser fixo por tenant (24 calls/dia), não multiplicado por usuários logados.

**Why this priority**: alimenta a US1; sem sync não há dado. Mesma prioridade porque a feature só faz sentido com as duas.

**Independent Test**: disparar o job manualmente (fila/endpoint de teste) com um tenant que tem Meta conectada e campanhas; confirmar que `metrics_daily` recebe upsert de linhas por (campanha, dia) e que nova execução não duplica nem corrompe (idempotência).

**Acceptance Scenarios**:

1. **Given** tenant com conta Meta ativa e campanhas, **When** o job roda, **Then** 1 chamada de insights por tenant (level=campaign, time_increment=1) cobrindo D-0..D-3, e upsert de uma linha por (tenant, campanha, data) com spend, impressions, clicks, ctr, cpm, cpc, conversions, roas, cpa.
2. **Given** o job roda 2× no mesmo dia, **When** a 2ª execução termina, **Then** nenhuma linha duplicada; valores atualizados por upsert; contagem de linhas estável.
3. **Given** tenant sem conexão Meta (ou token expirado), **When** o job roda, **Then** tenant é pulado com log de aviso; erro de um tenant não aborta os demais.
4. **Given** múltiplas instâncias da API, **When** o agendador dispara, **Then** só uma execução do job por vez (lock distribuído via Redis) — sem chamadas duplicadas à Meta.
5. **Given** campanha recém-arquivada/deletada na Meta, **When** o job roda, **Then** histórico já gravado permanece (nenhum delete de linhas existentes).

---

### User Story 3 - Fallback on-demand para lacunas (Priority: P2)

Como **usuário de um tenant recém-conectado**, quero ver métricas mesmo antes da primeira sincronização horária, porque conectei minha conta agora e não aceito tela vazia ou erro.

**Why this priority**: cobre casos de borda (tenant novo, range além da cobertura). A feature é útil sem ele (o job de 1h cobre o gap em no máx. 60min), mas é o que evita experiência quebrada no onboarding.

**Independent Test**: com `metrics_daily` vazia para o range pedido, consultar `/metrics/summary`; confirmar que o sistema busca na Meta, grava em `metrics_daily` e responde — e que repetir a consulta usa o pré-processado (sem nova chamada Meta).

**Acceptance Scenarios**:

1. **Given** range sem cobertura em `metrics_daily`, **When** endpoint de métrica consultado, **Then** sistema busca o range na Meta (on-demand), faz upsert no Postgres e responde com o dado.
2. **Given** o mesmo range consultado de novo, **When** já coberto, **Then** nenhum acesso on-demand à Meta (leitura só do Postgres).
3. **Given** range maior que 180 dias, **When** consultado, **Then** sistema responde com o que existe no pré-processado (sem on-demand para ranges absurdos — protege quota).

---

### User Story 4 - Aquecimento no startup (Priority: P3)

Como **operador**, quero que o job rode ao iniciar a API, porque após um deploy o dado fica no máximo ~1h desatualizado só no pior caso; o startup garante frescura imediata pós-deploy.

**Why this priority**: conveniência operacional; sem ela a primeira execução pós-deploy espera o próximo marcador de hora.

**Independent Test**: subir a API com um tenant já conectado; confirmar nos logs que o job de sync dispara após o startup (em background, sem atrasar o `listen`).

**Acceptance Scenarios**:

1. **Given** API iniciando, **When** processo sobe, **Then** job de sync dispara em background (não bloqueia startup) e falha silenciosa por tenant sem Meta.
2. **Given** 2 instâncias subindo quase juntas, **When** ambas disparam o warmup, **Then** o lock garante no máximo 1 execução simultânea (a 2ª pula ou espera).

## Edge Cases

- **Meta fora do ar / timeout**: job registra falha por tenant e tenta de novo no próximo ciclo (1h); endpoints seguem servindo o que existe (US1) — dado pode ficar até 2h desatualizado.
- **Token Meta expirado/revogado**: tenant pulado com aviso; status de conexão continua visível no UI existente; nenhum crash.
- **Tenant sem campanhas (conta nova)**: job grava nada; endpoints respondem com estado vazio atual (zeros), sem erro.
- **Range > 180 dias**: respondido do pré-processado existente, sem on-demand (proteção de quota; retenção é ilimitada, ver Decisões).
- **Mudança de fuso/período**: cálculo de "dia" usa o fuso America/Sao_Paulo já padronizado no app (`getSaoPauloYMD` no frontend); o job grava a data de insights da Meta (`date_start`) como chave do dia.
- **Revisão retroativa da Meta** (insights de D-2/D-3 alterados): job re-busca os últimos 4 dias a cada execução (D-0..D-3) e sobrescreve por upsert.
- **Concorrência on-demand × job**: upserts idempotentes + lock tornam inofensivo; última escrita vence, valores finais idênticos.
- **Quota Meta atingida (429)**: job encerra o ciclo do tenant com aviso; tenta de novo no próximo ciclo. (Nota: `metaApiCall` hoje não tem retry/backoff — fora de escopo, ver Riscos.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST criar tabela `metrics_daily` com PK `(tenant_id, campaign_id, date)` — FK tenant/campanha, valores numéricos (spend, impressions, clicks, ctr, cpm, cpc, conversions, roas, cpa), `updated_at`, RLS tenant-scoped.
- **FR-002**: Sistema MUST expor repository tenant-bound (`MetricsDailyRepository`) para toda leitura/escrita em `metrics_daily` — nada de `db` cru em service/controller (ADR-0001).
- **FR-003**: Sistema MUST executar job BullMQ de sincronização a cada 1h (cron `0 * * * *`), processando apenas tenants com conexão Meta ativa, com re-sync de D-0..D-3 por execução.
- **FR-004**: Sistema MUST usar upsert idempotente por (tenant, campaign, date) — executar 2× não duplica nem corrompe.
- **FR-005**: Sistema MUST isolar falha por tenant: erro num tenant NÃO interrompe os demais no mesmo ciclo.
- **FR-006**: Sistema MUST usar lock distribuído (Redis, NX com TTL) para impedir execução simultânea do job (multi-instância).
- **FR-007**: Sistema MUST disparar o job em background no startup da API (warmup pós-deploy), sem bloquear o `listen`.
- **FR-008**: Endpoints `GET /metrics/summary`, `/metrics/campaigns`, `/metrics/daily`, `/metrics/campaigns/:id/insights`, `/metrics/campaigns/:campaignId/adsets`(?), `GET /campaigns/:id/insights` e `GET /goals/progress` MUST ser servidos de `metrics_daily` (direto ou via agregação SQL), mantendo o contrato de resposta atual (envelope `ApiResponse<T>`, mesmos campos e formas).
- **FR-009**: Sistema MUST implementar fallback on-demand para ranges sem cobertura (≤180 dias): busca na Meta, upsert em `metrics_daily`, responde; ranges sem cobertura >180d respondem só com o pré-processado.
- **FR-010**: Sistema MUST remover o `/metrics/*` do caminho live-to-Meta no request path (Meta vira origem em background — job/fallback), exceto criativos e status de campanha conforme Assumptions.
- **FR-011**: Sistema MUST manter compatibilidade do critério de conversões: conversões em `metrics_daily` seguem o MESMO cálculo (`parseConversionsFromActions`, objective-aware) usado hoje em summary/listagem — o "Total Clientes" da tela de Campanhas continua reproduzindo o resumo do Dashboard.
- **FR-012**: Sistema MUST remover/ajustar o `refetchInterval` de 30s do hook `useCampaigns` (polling de 30s perde a razão de existir com pré-processado + invalidação por sync) — refetch apenas em remount/troca de período/invalidação explícita.
- **FR-013**: Sistema MUST registrar logs estruturados do job (tenants processados, linhas upsertadas, falhas) observáveis (padrão dos workers existentes).
- **FR-014**: Sistema MUST fazer `metrics_daily` alimentar também o fake/mock provider usado em dev (`META_USE_MOCK`), preservando fluxos de teste locais.

### Key Entities *(include if feature involves data)*

- **metrics_daily**: 1 linha = 1 campanha × 1 dia × 1 tenant. Atributos: identificação (tenant_id, campaign_id, campaign_meta_id?, date), métricas (spend, impressions, clicks, ctr, cpm, cpc, conversions, roas, cpa), updated_at. PK composta; índices por (tenant_id, date).
- **Sync job**: worker BullMQ repetível a cada 1h + warmup no startup; lock Redis; idempotente.
- **MetaInsightsSyncService**: serviço de domínio que orquestra busca na Meta + upsert via repository; injeção no `di.ts`.
- **MetricsDailyRepository**: única porta de persistência para `metrics_daily` (tenant-bound).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Carregamento do Dashboard com período recorrente: de 7–10 chamadas Meta por visita para **0 chamadas Meta no request path**; resposta <100ms p95 por endpoint de métrica (vs. segundos hoje).
- **SC-002**: Consumo de quota Meta: de ~240 calls/h/usuário (tela de Campanhas aberta) para **24 calls/dia/tenant** (job 1h) + fallbacks on-demand excepcionais.
- **SC-003**: Dashboard/Campanhas/Insights continuam exibindo números idênticos aos de hoje para o mesmo período (paridade do critério de conversões validado por teste).
- **SC-004**: Idempotência: execução dupla do job não muda a contagem de linhas de `metrics_daily`.
- **SC-005**: Tela de Campanhas deixa de refetch a cada 30s (polling removido; dado ≤60min + invalidação por sync).

## Assumptions

- **Criativos e status de campanha seguem live nesta feature**: a listagem/insights continua buscando nomes/status dos criativos onde já busca hoje (campanhas: DB local + Meta; insights: Meta) — persistir criativos no R2 é feature seguinte. O pesado (métricas) vem do pré-processado.
- Retenção **ilimitada** (decisão do Diogo): sem rollup mensal; revisitar particionamento só se a tabela passar de ~100M linhas (cenários atuais indicam ~3,7M em 5 anos).
- Job a **cada 1h** (decisão do Diogo): dado fica ≤1h atrasado; frequência é parâmetro de config, fácil de ajustar depois.
- O frontend já cacheia no cliente (TanStack Query); esta feature NÃO altera o cache client-side além do polling (FR-012).
- O endpoint `/metrics/campaigns/:id/adsets` é servido junto dos demais se o custo for baixo; caso o provider atual não o implemente para Postgres, segue live e fica fora da paridade (verificar durante o plan).
- O fallback on-demand reaproveita a infraestrutura atual de chamadas Meta (`db-metrics.provider`) para buscar e normalizar insights.
- Sem mudança no desenho de autenticação/tenancy: `metrics_daily` herda o padrão RLS das tabelas de tenant existentes.
- Redis segue para rate-limit/BullMQ/sessão; cache HTTP de leitura (middleware Redis) fica para feature de cache, não é pré-requisito desta.

## Decisões Confirmadas (2026-09-10)

1. **Modo de execução**: spec escrita manualmente por mim (caminho da 013), plan/tasks delegáveis depois ao opencode uma fase por vez.
2. **Branch**: nova feature branch **a partir de `origin/hmg`** (cópia), não de `dev`.
3. **Frequência do job**: **a cada 1h** (mais fresco; 24 calls/tenant/dia).
4. **Retenção**: **ilimitada** (sem rollup; particionamento só se >100M linhas).
5. **Escopo**: **núcleo** — tabela `metrics_daily` + job sync + endpoints de métricas lendo dela. BFF `/dashboard` e criativos persistidos ficam para features seguintes.
6. **Não cachear sem pré-processar**: cache Redis de HTTP fica para depois; a tabela é a solução estrutural.
