# Análise de Viabilidade de KPIs - Schema Atual
**Data:** 2026-06-28  
**Escopo:** O que é implementável COM O SCHEMA EXISTENTE, sem mudanças

---

## RESUMO EXECUTIVO

| KPI | Viável? | Tabelas | Regra de Negócio | Limitações |
|-----|---------|---------|------------------|-----------|
| **MRR** | ✅ Sim | invoices, subscriptions, plans | Soma de invoices pagos do mês atual | Sem currency (assume BRL) |
| **Trial → Paid** | ⚠️ Limitado | subscriptions | Conta tenants com status mudado de trial para active | Não sabe exatamente quando ocorreu transição |
| **Churn** | ⚠️ Limitado | subscriptions | Tenants com status = cancelled em período | Não sabe exatamente quando cancelou |
| **ROAS** | ⚠️ Limitado | campaigns | Extrai spend/revenue de campaigns.metrics (JSONB) | Sem histórico, sem granularidade, sem atualização timestamp |
| **Campanhas Ativas** | ✅ Sim | campaigns | COUNT where status = 'active' | Sem end_date, não sabe quando realmente terminou |
| **Distribuição de Grades** | ✅ Sim | performance_scores | Agrupa grades por período | Sem clareza se score sobrescreve ou acumula |
| **Latência p50/p95/p99** | ✅ Sim | request_logs | PERCENTILE_CONT de response_time_ms | Requer particionamento futuro, sem TTL atual |
| **Taxa de Erros 4xx/5xx** | ✅ Sim | request_logs | COUNT where status_code >= 400 | Sem categorização de tipo de erro |
| **Requests por Minuto** | ✅ Sim | request_logs | COUNT(*) GROUP BY time_bucket | Simples aggregation |
| **Top Endpoints Lentos** | ⚠️ Limitado | request_logs | GROUP BY path_template | path_template pode ser NULL, sem normalização de params |
| **Tenants Ativos 24h** | ✅ Sim | request_logs | COUNT(DISTINCT tenant_id) últimas 24h | tenant_id pode ser NULL, não captura inativos |
| **Automações por Dia** | ✅ Sim | automation_rules, rule_executions | COUNT criadas por dia, COUNT execuções por dia | Sem granularidade de acionamento |
| **Criativos Gerados** | ✅ Sim | creative_assets | COUNT por tipo, por compliance_status | Sem link para campaigns, sem modelo de IA |

---

## ANÁLISE DETALHADA POR KPI

### 1. MRR (Monthly Recurring Revenue)

**Viável?** ✅ **SIM**

**Tabelas utilizadas:**
- `invoices` (amount_cents, status, created_at)
- `subscriptions` (status, plan_id, tenant_id)
- `plans` (price_cents, name, interval)

**Regra de Negócio:**
- MRR = Soma de todos os `invoices.amount_cents` com `status = 'paid'` criados no mês atual, agrupado por subscription
- Considera apenas subscriptions ativas (status = 'active') ou aquelas que geraram invoice no mês
- Período: mês corrente (DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()))
- Conversão: amount_cents / 100 para BRL

**Limitações:**
- ❌ Sem coluna currency: assume tudo é BRL
- ❌ `created_at` vs `paid_at`: qual usar? Se invoice.paid_at é NULL, a métrica falha. Recomenda-se usar `paid_at` quando não NULL, senão skip
- ⚠️ Se mesma subscription tem múltiplas invoices/mês, soma todas (correto para recorrência)
- ⚠️ Não diferencia trial vs paid (tudo conta como MRR)

**Output esperado:**
```
month: "2026-06-01"
mrr_brl: 15234.50
active_subscriptions: 42
```

---

### 2. Trial → Paid (Taxa de Conversão Trial → Paid)

**Viável?** ⚠️ **LIMITADO**

**Tabelas utilizadas:**
- `subscriptions` (status, created_at)

**Regra de Negócio - Opção A (Atual):**
- Trials iniciados = subscriptions onde `created_at` é em período X
- Conversões = subscriptions com `status = 'active'` criadas em mesmo período X (assumindo que trial que virou active no mês X foi criado em X)
- Taxa = (conversões / trials) * 100%
- **PROBLEMA:** Não dá distinguir se criou como trial e virou active, ou se criou já como active

**Regra de Negócio - Opção B (Melhor, com caveat):**
- Trials iniciados = subscriptions onde `trial_ends_at > created_at` (existe trial_ends_at preenchido)
- Conversões = aquelas que também têm `status = 'active'` (assumindo que se virou active, converteu)
- Taxa = (COUNT(status='active' AND trial_ends_at > created_at) / COUNT(trial_ends_at > created_at)) * 100%
- **PROBLEMA:** Também é impreciso, pois não diferencia "converteu durante trial" de "virou active depois"

**Limitações CRÍTICAS:**
- ❌ Sem `subscription_status_history`: não sabe QUANDO virou active
- ❌ Sem `converted_at`: não dá rastrear data exata de conversão
- ❌ Status atual não informa histórico (se é active agora, pode ter sido em qualquer data)
- ❌ Sem coluna `is_trial` ou similar para marcar trials passados que não são mais trial

**Output esperado (com caveat):**
```
period: "2026-06-01 to 2026-06-30"
trials_with_trial_ends_at: 15
active_in_same_period: 12
estimated_conversion_rate_pct: 80.0
warning: "Métrica imprecisa - conversões podem ter ocorrido depois do período"
```

---

### 3. Churn (Taxa de Cancelamento)

**Viável?** ⚠️ **LIMITADO**

**Tabelas utilizadas:**
- `subscriptions` (status, updated_at, created_at)

**Regra de Negócio:**
- Churn = subscriptions com `status = 'cancelled'`
- Período de churn = usar `updated_at` como proxy para "data do cancelamento"
- Taxa de churn = (COUNT(status='cancelled' AND updated_at em período X) / COUNT(ativo em início de período X)) * 100%

**Limitações CRÍTICAS:**
- ❌ Sem `canceled_at`: updated_at é impreciso (pode ter mudado por outro motivo)
- ❌ Sem `cancellation_reason`: não sabe por quê cancelou
- ❌ Sem tenure: não consegue calcular churn rate por cohort (quanto tempo durou antes de cancelar)
- ⚠️ `updated_at` pode mudar por qualquer mudança (trial_ends_at update, etc.), não é confiável como indicador de cancelamento

**Output esperado (com caveat):**
```
period: "2026-06-01 to 2026-06-30"
churned_subscriptions: 3
active_start_of_period: 50
estimated_churn_rate_pct: 6.0
warning: "Métrica imprecisa - updated_at pode ter mudado por outros motivos"
```

---

### 4. ROAS (Return on Ad Spend)

**Viável?** ⚠️ **LIMITADO**

**Tabelas utilizadas:**
- `campaigns` (metrics JSONB, status, created_at, name)

**Regra de Negócio:**
- ROAS = `metrics->>'revenue'` / `metrics->>'spend'` para cada campaign
- Filtra apenas campaigns com `status = 'active'` OU `status = 'paused'` (campanhas em execução/teve execução)
- Assume que `metrics` tem campos 'revenue' e 'spend' preenchidos
- Se spend = 0, ROAS = NULL ou undefined (evita divisão por zero)

**Limitações CRÍTICAS:**
- ❌ JSONB sem schema validado: não há garantia de que 'revenue' ou 'spend' existem em metrics
- ❌ Sem histórico: metrics sobrescreve anterior (não dá saber evolução)
- ❌ Sem timestamp de atualização: não dá saber se métrica é de hoje ou de 3 meses atrás
- ❌ Sem granularidade: tudo agregado, não dá ROAS diário
- ❌ Sem clareza se spend é total da campanha ou do dia
- ⚠️ Dados podem ser enviados por webhook de Meta, se webhook falhar, dados ficam obsoletos

**Output esperado (com caveat):**
```
campaign_id: "uuid-123"
campaign_name: "Summer Sale 2026"
spend_brl: 5000.00
revenue_brl: 22500.00
roas: 4.5
status: "active"
warning: "Métrica pode estar desatualizada. Última atualização desconhecida"
```

---

### 5. Campanhas Ativas

**Viável?** ✅ **SIM**

**Tabelas utilizadas:**
- `campaigns` (status, created_at, tenant_id)

**Regra de Negócio:**
- Campanhas ativas = `status = 'active'`
- Histórico diário: COUNT(status='active') para cada DATE_TRUNC('day', created_at)
- OU: Snapshot atual = COUNT(status='active') NOW()

**Limitações:**
- ⚠️ Sem `end_date` ou `ended_at`: não dá saber quando campanha realmente terminou. Pode estar marcada como 'active' mas não estar rodando na Meta
- ⚠️ `last_synced_at` pode indicar se está "viva", mas não é confiável
- ⚠️ Não diferencia "nunca rodar" de "rodando agora"

**Output esperado:**
```
active_campaigns_total: 42
by_tenant: {
  "tenant-uuid-1": 12,
  "tenant-uuid-2": 8,
  ...
}
warning: "Status = 'active' é apenas flag local. Pode não refletir status real na Meta"
```

---

### 6. Distribuição de Grades (Performance Grade Distribution)

**Viável?** ✅ **SIM**

**Tabelas utilizadas:**
- `performance_scores` (grade, campaign_id, computed_at, tenant_id)

**Regra de Negócio:**
- Grades = valores em `performance_scores.grade` (A, B, C, D, F)
- Período: ultimas N horas/dias (usar `computed_at`)
- Distribuição = COUNT by grade, com percentual
- Uma campanha pode ter múltiplas scores (histórico?), usar a mais recente

**Limitações:**
- ⚠️ Sem clareza se múltiplas linhas por campaign = histórico ou duplicata
- ⚠️ Sem coluna para marcar "latest score" (teria que ordernar por computed_at DESC LIMIT 1 por campaign)
- ⚠️ Sem FK entre performance_scores e campaigns, é apenas campaign_id
- ⚠️ Não dá saber se score é (1-100) ou algo else

**Output esperado:**
```
period: "last_7_days"
distribution: {
  "A": { count: 45, pct: 32.1 },
  "B": { count: 38, pct: 27.1 },
  "C": { count: 32, pct: 22.9 },
  "D": { count: 18, pct: 12.9 },
  "F": { count: 7, pct: 5.0 }
}
total_scores: 140
```

---

### 7. Latência p50/p95/p99 (Response Time Percentiles)

**Viável?** ✅ **SIM**

**Tabelas utilizadas:**
- `request_logs` (response_time_ms, created_at, tenant_id, path_template)

**Regra de Negócio:**
- Calcula PERCENTILE_CONT(0.50), (0.95), (0.99) de `response_time_ms`
- Período: últimas 24h / 7 dias / 30 dias (configurável)
- Granularidade: por hora, por minuto (configurável)
- Pode segmentar por tenant, por endpoint, por status_code (opcional)

**Limitações:**
- ⚠️ Sem particionamento: tabela cresce infinitamente, queries em range de tempo ficarão lentas
- ⚠️ Sem TTL: logs antigos não são deletados
- ⚠️ Se table > 10GB, percentile queries ficam lentes sem índices apropriados
- ⚠️ response_time_ms é inteiro: perda de precisão em sub-milisegundos (OK para maioria dos casos)

**Output esperado:**
```
period: "2026-06-28 12:00 to 2026-06-28 13:00"
p50_ms: 145
p95_ms: 892
p99_ms: 3421
avg_ms: 234
max_ms: 8934
sample_size: 12543
```

---

### 8. Taxa de Erros 4xx/5xx (Error Rate)

**Viável?** ✅ **SIM**

**Tabelas utilizadas:**
- `request_logs` (status_code, created_at, tenant_id, path_template)

**Regra de Negócio:**
- Erros = `status_code >= 400`
- Erros 4xx = 400-499 (client error)
- Erros 5xx = 500-599 (server error)
- Taxa de erro = (COUNT(status >= 400) / COUNT(*)) * 100%
- Período: últimas 24h / hora / minuto (configurável)

**Limitações:**
- ⚠️ Sem categorização de erro: não dá distinguir 400 (validation) de 403 (forbidden) de 404 (not found)
- ⚠️ Sem request_body ou error message: não dá debugar qual foi o erro
- ⚠️ 4xx pode incluir requisições legítimas (404 é "not found", não é bug)

**Output esperado:**
```
period: "2026-06-28 00:00 to 2026-06-28 23:59"
total_requests: 145234
errors_4xx: 2341
errors_5xx: 123
error_rate_pct: 1.70
errors_4xx_pct: 1.61
errors_5xx_pct: 0.09
```

---

### 9. Requests por Minuto (RPS - Requests Per Second/Minute)

**Viável?** ✅ **SIM**

**Tabelas utilizadas:**
- `request_logs` (created_at, tenant_id)

**Regra de Negócio:**
- RPS = COUNT(*) / 60 (para converter minuto em segundo)
- Granularidade: por minuto, por hora (configurável)
- Período: últimas 24h / realtime (últimos 5 min)

**Limitações:**
- ⚠️ Sem TTL: logs antigos consomem espaço
- ⚠️ created_at pode ter skew se servidor não sincroniza hora (hora do cliente vs servidor)

**Output esperado:**
```
minute: "2026-06-28 13:42:00"
request_count: 1234
rps: 20.57
peak_at_minute: true
```

---

### 10. Top Endpoints Lentos

**Viável?** ⚠️ **LIMITADO**

**Tabelas utilizadas:**
- `request_logs` (path_template, path, response_time_ms, created_at, method)

**Regra de Negócio:**
- Agrupa por `COALESCE(path_template, path)` (prefere path_template se preenchido)
- Calcula AVG(response_time_ms), P95, MAX por endpoint
- Filtra apenas últimos N dias (ex: 7 dias)
- Ordena por AVG(response_time_ms) DESC
- LIMIT 20 endpoints

**Limitações CRÍTICAS:**
- ❌ `path_template` pode ser NULL para alguns requests (sem informação de qual middleware preencheu)
- ❌ Sem normalização de paths com parâmetros: `/campaigns/123` e `/campaigns/456` aparecem como 2 paths diferentes (sem path_template)
- ⚠️ Um endpoint pode ter muitas variações (GET /users/:id vs POST /users/:id), não está normalizado
- ⚠️ Sem segmentação por status_code: endpoint "lento" pode ser lento porque retorna erro 500

**Output esperado (com caveat):**
```
endpoint: "POST /api/campaigns"
method: "POST"
request_count: 1234
avg_response_time_ms: 1456
p95_response_time_ms: 3421
max_response_time_ms: 8934
warning: "Alguns requests podem não ter path_template preenchido, agrupamento pode ser impreciso"
```

---

### 11. Tenants Ativos em 24h

**Viável?** ✅ **SIM**

**Tabelas utilizadas:**
- `request_logs` (tenant_id, created_at)

**Regra de Negócio:**
- Tenants ativos = DISTINCT(tenant_id) com `created_at > NOW() - INTERVAL '24 hours'`
- Pode segmentar por status_code (ex: apenas requisições bem-sucedidas)

**Limitações:**
- ⚠️ `tenant_id` pode ser NULL em request_logs (requisições não autenticadas)
- ⚠️ Um tenant pode fazer 1 requisição (contar) ou 10000 (mesma contagem)
- ⚠️ Não diferencia "ativo usando app" de "ativo vendo email"

**Output esperado:**
```
active_tenants_24h: 47
timestamp: "2026-06-28 13:45:00"
breakdown_by_hour: {
  "12:00": 45,
  "13:00": 47,
  ...
}
```

---

### 12. Automações por Dia (Automation Rules)

**Viável?** ✅ **SIM**

**Tabelas utilizadas:**
- `automation_rules` (created_at, is_active, tenant_id)
- `rule_executions` (triggered_at, rule_id, campaign_id, action_taken)

**Regra de Negócio - Parte A (Criadas):**
- Automações criadas por dia = COUNT(automation_rules) GROUP BY DATE_TRUNC('day', created_at)
- Ativas = COUNT(WHERE is_active = true) GROUP BY date

**Regra de Negócio - Parte B (Acionadas):**
- Automações acionadas por dia = COUNT(rule_executions) GROUP BY DATE_TRUNC('day', triggered_at)
- Agrupa por action_taken (qual ação foi executada)

**Limitações:**
- ⚠️ automation_rules e rule_executions são tabelas diferentes (rule_executions refere-se a performance_rules, não automation_rules)
- ⚠️ Sem clareza qual é a tabela "correta" de execução
- ⚠️ Sem rastreamento de sucesso/falha (se ação foi executada mesmo ou não)

**Output esperado:**
```
date: "2026-06-28"
automation_rules_created: 3
automation_rules_active: 18
rule_executions: 42
top_actions: {
  "pause": 25,
  "adjust_budget": 12,
  "increase_bid": 5
}
```

---

### 13. Criativos Gerados

**Viável?** ✅ **SIM**

**Tabelas utilizadas:**
- `creative_assets` (created_at, type, compliance_status, tenant_id)

**Regra de Negócio:**
- Criativos gerados por dia = COUNT(creative_assets) GROUP BY DATE_TRUNC('day', created_at)
- Por tipo = GROUP BY type (image, video, copy)
- Compliance = COUNT GROUP BY compliance_status (pending_compliance, approved, rejected)

**Limitações:**
- ⚠️ Sem coluna `campaign_id`: não dá saber qual criativo foi para qual campanha
- ⚠️ Sem coluna `ai_model`: não dá rastrear qual modelo gerou (DALL-E? GPT-4 Vision?)
- ⚠️ Sem coluna `generation_time_ms`: não dá medir performance de geração
- ⚠️ Sem coluna de "usado" ou "performance": não dá saber se criativo gerado foi realmente usado

**Output esperado:**
```
date: "2026-06-28"
total_creatives: 47
by_type: {
  "image": 32,
  "video": 10,
  "copy": 5
}
by_compliance_status: {
  "pending_compliance": 5,
  "approved": 40,
  "rejected": 2
}
```

---

## SUMÁRIO DE VIABILIDADE

### ✅ Totalmente Viável (Implementar imediatamente)
1. **Campanhas Ativas** - Simples COUNT by status
2. **Distribuição de Grades** - Simples agregação de enums
3. **Latência p50/p95/p99** - Dado bem estruturado em request_logs
4. **Taxa de Erros 4xx/5xx** - Simples filtro por status_code
5. **Requests por Minuto** - Simples contagem
6. **Tenants Ativos 24h** - DISTINCT count com filtro de tempo
7. **Criativos Gerados** - Simples agregação
8. **MRR** - Dado bem estruturado (com caveat currency)
9. **Automações por Dia** - Duas tabelas disponíveis

### ⚠️ Viável com Limitações (Implementar com disclaimers)
10. **Trial → Paid** - Precisa de proxy com status_history implícito
11. **Churn** - Precisa de proxy com updated_at (impreciso)
12. **ROAS** - Extrai de JSONB, sem histórico, sem timestamp
13. **Top Endpoints Lentos** - path_template pode ser NULL

### 🔴 Não Viável (Bloquear C1)
Nenhum KPI é totalmente impossível. Todos são implementáveis com suas limitações documentadas.

---

## RECOMENDAÇÃO PARA docs/observability/kpis.md

**Estrutura do documento:**
1. Cada KPI tem seção com:
   - Descrição do KPI
   - Dados utilizados (tabelas)
   - Regra de negócio adotada
   - Limitações/Disclaimers
   - Granularidade suportada
   - Frequência de atualização

2. Notas de implementação:
   - MRR: assumir BRL, usar `invoices.paid_at`
   - Trial→Paid: avisar imprecisão, considerar como "best effort"
   - Churn: avisar imprecisão, considerar como "best effort"
   - ROAS: avisar que métrica pode estar desatualizada
   - Top Endpoints: avisar sobre NULL path_template

3. Observações gerais:
   - request_logs cresce rapidamente (implementar TTL/particionamento em roadmap)
   - JSONBs (campaigns.metrics, etc.) ficam obsoletos sem webhook de sincronização
   - Sem SCD Type 2 (histórico de status), algumas métricas são proxies

---

## TABELA DE DECISÃO FINAL

| KPI | Implementar em C1? | Prioridade | Status no Doc |
|-----|-------------------|-----------|---------------|
| MRR | ✅ Sim | 🔴 Alta | Green (com caveat currency) |
| Trial → Paid | ✅ Sim | 🟡 Média | Yellow (impreciso) |
| Churn | ✅ Sim | 🟡 Média | Yellow (impreciso) |
| ROAS | ✅ Sim | 🟡 Média | Yellow (pode estar desatualizado) |
| Campanhas Ativas | ✅ Sim | 🟢 Baixa | Green |
| Distribuição Grades | ✅ Sim | 🟢 Baixa | Green |
| Latência p50/p95/p99 | ✅ Sim | 🔴 Alta | Green |
| Taxa Erros 4xx/5xx | ✅ Sim | 🔴 Alta | Green |
| Requests por Minuto | ✅ Sim | 🟢 Baixa | Green |
| Top Endpoints Lentos | ✅ Sim | 🟡 Média | Yellow (normalizando) |
| Tenants Ativos 24h | ✅ Sim | 🟢 Baixa | Green |
| Automações por Dia | ✅ Sim | 🟢 Baixa | Green |
| Criativos Gerados | ✅ Sim | 🟢 Baixa | Green |

---

**Conclusão:** Todos os 13 KPIs são implementáveis com o schema atual. O documento deve ser honesto sobre limitações (especialmente Trial→Paid, Churn, ROAS) para não gerar falsos positivos.
