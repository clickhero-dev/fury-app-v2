# Análise Técnica do Schema PostgreSQL - FURY App

**Data da análise:** 2026-06-28  
**Versão do schema:** Baseado em 17 migrations (0000-0017)  
**Status:** Análise para suporte a task C1 (Observability KPIs)

---

## 1. TABELAS EXISTENTES - INVENTÁRIO COMPLETO

### 1.1 Tabelas de Infraestrutura Base

#### `tenants` (multi-tenancy)
- **Colunas:** id (PK), name, slug, created_at
- **Finalidade:** Identificar clientes/organizações do SaaS
- **Índices:** slug
- **Relacionamentos:** Pai de 90% das outras tabelas (FK em cascade)
- **Importância para KPIs:** CRÍTICA - filtro essencial para todos os KPIs

#### `users`
- **Colunas:** id (PK), tenant_id (FK), email, password_hash, role, created_at
- **Finalidade:** Autenticação e autorização de usuários
- **Índices:** tenant_id, email+tenant_id (compound)
- **Papel em KPIs:** Não usado diretamente, mas essencial para rastrear atividade por usuário
- **Gap identificado:** Sem coluna updated_at, sem timestamp de última atividade

---

### 1.2 Tabelas de Campanha & Criativo (Core Domain)

#### `campaigns`
- **Colunas:**
  - id (PK), tenant_id (FK), meta_campaign_id (varchar 255)
  - name, status (enum: draft/active/paused/archived)
  - budget (JSONB), metrics (JSONB)
  - last_synced_at, created_at
- **Finalidade:** Armazenar campanhas publicitárias (Meta/Facebook Ads)
- **Índices:** tenant_id, meta_campaign_id
- **Status enum:** draft | active | paused | archived
- **⚠️ GAP CRÍTICO:** 
  - Sem data de conclusão/término (end_date/ended_at)
  - Sem duração (duration)
  - Sem dados de spend/spend_date (está em JSONB, difícil de queryar)
  - Sem data de última atualização de status

#### `creative_assets`
- **Colunas:**
  - id (PK), tenant_id (FK), type (enum: image/video/copy)
  - url, meta_asset_id, compliance_status (enum: pending/approved/rejected)
  - compliance_notes, created_at
- **Finalidade:** Armazenar assets criativos gerados por IA
- **Índices:** tenant_id, meta_asset_id
- **Status enum:** pending_compliance | approved | rejected
- **⚠️ GAPS:**
  - Sem link explícito para campaigns (sem campaign_id)
  - Sem coluna de performance/engagement
  - Sem referência a qual template/IA foi usada para gerar

#### `fury_insights`
- **Colunas:**
  - id (PK), tenant_id (FK), campaign_id (FK)
  - suggestion_type, suggestion_data (JSONB)
  - applied_at, created_at
- **Finalidade:** Sugestões/insights gerados pela IA (Fury)
- **Índices:** tenant_id, campaign_id
- **Relacionamento:** campaign_id → campaigns
- **Nota:** Dados de sugestão estão em JSONB, difícil extrair para KPIs

---

### 1.3 Tabelas de Configuração & Automação

#### `client_goals`
- **Colunas:**
  - id (PK), tenant_id (FK)
  - objective, monthly_budget (JSONB), target_cpa (JSONB)
  - niche, main_product (varchar 500), created_at, updated_at
- **Finalidade:** Goals/configuração de negócio do cliente
- **Índices:** tenant_id
- **⚠️ GAPS:**
  - Sem data de início/fim dos goals
  - Sem tracking de mudanças (SCD Type 2 não implementado)
  - Budget em JSONB, não em colunas normalizadas

#### `fury_config`
- **Colunas:**
  - id (PK), tenant_id (FK, UNIQUE)
  - target_roas, target_cpa, target_ctr, target_budget_utilization (numeric)
  - updated_at
- **Finalidade:** Configuração global de thresholds para Fury
- **Índices:** tenant_id
- **Valor para KPIs:** Suporta cálculo de target ROAS/CPA para análise

#### `automation_rules`
- **Colunas:**
  - id (PK), tenant_id (FK)
  - name, description, trigger, rule_type
  - is_active, threshold, action (default: pause)
  - created_at, updated_at
- **Finalidade:** Regras de automação (pausa campanhas se CPC > X, etc.)
- **Índices:** tenant_id
- **Para KPIs:** Rastreia automações criadas e ativas

#### `performance_rules`
- **Colunas:**
  - id (PK), tenant_id (FK)
  - name, condition_field, condition_operator, condition_value
  - action, action_value, is_active
  - created_at
- **Finalidade:** Regras de performance (diferente de automation_rules)
- **Índices:** tenant_id
- **⚠️ Duplicação:** Parece funcionalidade similar a automation_rules

---

### 1.4 Tabelas de Performance & Scoring

#### `performance_scores`
- **Colunas:**
  - id (PK), campaign_id (FK), tenant_id (FK)
  - score (integer), grade (enum: A/B/C/D/F)
  - computed_at, metrics_snapshot (JSONB)
- **Finalidade:** Scores de performance (1-100) + grade (A-F) para campanhas
- **Índices:** campaign_id, tenant_id, computed_at
- **Importância:** CRÍTICA para distribuição de grades (KPI: "Distribuição de grades")
- **⚠️ GAPS:**
  - Sem versioning - sobrescreve score anterior?
  - metrics_snapshot está em JSONB, difícil aggregar

#### `rule_executions`
- **Colunas:**
  - id (PK), rule_id (FK), campaign_id (FK)
  - triggered_at, action_taken, result (JSONB)
- **Finalidade:** Log de execuções de performance_rules
- **Índices:** rule_id, campaign_id, triggered_at
- **Para KPIs:** Rastreia ações automatizadas

#### `budget_optimizations`
- **Colunas:**
  - id (PK), tenant_id (FK)
  - total_budget, adjustments (JSONB), mode (enum: suggestion/auto)
  - status (enum: pending/applied/rejected)
  - applied_at, rejected_at, created_at, updated_at
- **Finalidade:** Sugestões de realocação de budget entre campanhas
- **Índices:** tenant_id, status
- **⚠️ GAPS:**
  - Sem link para campaigns específicas (está em adjustments JSONB)

---

### 1.5 Tabelas de Billing/Monetização

#### `plans`
- **Colunas:**
  - id (PK), name, price_cents, interval (enum: monthly/yearly)
  - features (JSONB), is_active, created_at
- **Finalidade:** Definição de planos de SaaS (global, não per-tenant)
- **Índices:** Nenhum
- **Para KPIs:** Suporta cálculo de MRR

#### `subscriptions`
- **Colunas:**
  - id (PK), tenant_id (FK), plan_id (FK)
  - asaas_subscription_id, asaas_customer_id (integração com ASAAS)
  - status (enum: trial/active/past_due/cancelled/inactive)
  - trial_ends_at, current_period_end
  - created_at, updated_at
- **Finalidade:** Tracking de inscrição por tenant
- **Índices:** tenant_id, status
- **CRÍTICA para KPIs:**
  - Trial → Paid: status transition de trial → active
  - Churn: status transition para cancelled
  - Active tenants: status = active
  - MRR: precisa da data de created_at, status = active, valor do plan
- **⚠️ GAPS:**
  - Sem coluna de cancellation_reason
  - Sem coluna canceled_at (para churn date)
  - Sem número de renovações (lifecycle tracking)

#### `invoices`
- **Colunas:**
  - id (PK), tenant_id (FK), subscription_id (FK)
  - asaas_payment_id (integração ASAAS)
  - amount_cents, status (enum: pending/paid/overdue/cancelled)
  - paid_at, created_at
- **Finalidade:** Tracking de pagamentos
- **Índices:** tenant_id, subscription_id, status
- **Para KPIs:**
  - MRR: amount_cents onde status = paid, agrupar por mês
  - Churn: invoice não paga = indicador de churn
  - Revenue: sum(amount_cents) onde paid_at é last month
- **⚠️ GAPS:**
  - Sem moeda/currency (assume BRL)
  - Sem período de faturamento (period_start/end)
  - Sem retry logic tracking (quantas tentativas de cobrança)

---

### 1.6 Tabelas de Observabilidade/Logging

#### `request_logs`
- **Colunas:**
  - id (bigserial PK), created_at (timestamptz), request_id (uuid)
  - tenant_id (FK), user_id, method, path, path_template
  - status_code (smallint), response_time_ms (integer)
  - ip_address, user_agent, request_headers (JSONB), request_body (JSONB)
- **Finalidade:** Log detalhado de HTTP requests (para debugging/observabilidade)
- **Índices:** (tenant_id, created_at DESC), (status_code, created_at DESC), request_id
- **CRÍTICA para KPIs:**
  - Taxa de erros 4xx/5xx: GROUP BY status_code/100 WHERE status_code >= 400
  - Latência p50/p95/p99: PERCENTILE_CONT(response_time_ms)
  - Requests por minuto: COUNT(*) GROUP BY time_bucket('1 minute', created_at)
  - Top endpoints lentos: GROUP BY path_template ORDER BY AVG(response_time_ms)
- **⚠️ GAPS:**
  - Particionamento: com crescimento, precisa de particionamento por data
  - Sem coluna de usuario_id claramente normalizável (bigint, mas sem FK)
  - path_template NULL para alguns requests

#### `form_submissions`
- **Colunas:**
  - id (UUID PK), tenant_id (FK), user_id (FK)
  - form_type, status (enum: PENDING/COMPLETED/ERROR/ABANDONED)
  - abandoned_at, created_at, updated_at
- **Finalidade:** Rastrear submissões de formulário (signup, setup, etc.)
- **Índices:** tenant_id, user_id, form_type, status, (tenant_id, form_type)
- **Para KPIs:**
  - Onboarding success rate: COUNT(status = COMPLETED) / COUNT(*)
  - Abandonment rate: COUNT(status = ABANDONED) / COUNT(*)
  - Tempo de completude: EXTRACT(EPOCH FROM (updated_at - created_at))
- **⚠️ GAPS:**
  - Sem coluna de duração/time_to_completion
  - Sem tracking de step (em forms multi-step, em qual step foi abandonado?)

---

### 1.7 Tabelas de UX/Configuração

#### `brand_kits`
- **Colunas:**
  - id (PK), tenant_id (FK, UNIQUE)
  - logo_url, primary_color, secondary_color
  - voice_tone (enum: professional/casual/urgent/premium)
  - photo_urls (JSONB), created_at, updated_at
- **Finalidade:** Armazenar brand guidelines (para geração de criativos)
- **Índices:** tenant_id
- **Para KPIs:** Não diretamente, mas indica tenants que completaram onboarding

#### `meta_connections`
- **Colunas:**
  - id (PK), tenant_id (FK), meta_user_id
  - access_token, token_expires_at
  - ad_accounts (JSONB - lista de ad account IDs)
  - created_at
- **Finalidade:** Integração OAuth com Meta/Facebook
- **Índices:** tenant_id, meta_user_id
- **Para KPIs:** 
  - Tenants conectados: COUNT(DISTINCT tenant_id)
  - Ad accounts por tenant: JSON array length em ad_accounts
- **⚠️ GAPS:**
  - Sem coluna updated_at para rastrear reconexões
  - Sem coluna is_active (alguma conexão pode ser invalidada)

---

## 2. RELACIONAMENTOS PRINCIPAIS

```
tenants (raiz)
├── users
├── campaigns
│   ├── fury_insights
│   ├── performance_scores
│   └── rule_executions → performance_rules
├── creative_assets
├── client_goals
├── fury_config
├── automation_rules
├── performance_rules
├── budget_optimizations
├── brand_kits
├── meta_connections
├── subscriptions → plans
│   └── invoices
├── request_logs
├── form_submissions
└── performance_scores
```

**Grau de normalização:** 65% - Existem muitos JSONBs que deveriam ser colunas normalizadas

---

## 3. SUPORTE POR KPI - MAPEAMENTO DETALHADO

### 3.1 **MRR (Monthly Recurring Revenue)**

**Cálculo proposto:**
```sql
SELECT 
  DATE_TRUNC('month', i.created_at) as month,
  SUM(i.amount_cents) / 100.0 as mrr_brl
FROM invoices i
JOIN subscriptions s ON i.subscription_id = s.id
WHERE i.status = 'paid' 
  AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', NOW())
GROUP BY month;
```

**Tabelas usadas:** `invoices`, `subscriptions`  
**Colunas essenciais:** invoices.amount_cents, invoices.status, invoices.created_at, invoices.subscription_id, subscriptions.status  
**Status:** ✅ **SUPORTADO** - Dados necessários existem

**⚠️ Considerações:**
- MRR assume apenas ativos (subscriptions.status = 'active')
- invoices.created_at vs paid_at: usar paid_at para acurácia
- Conversão de cents para BRL: /100
- **GAP:** Sem coluna de currency (assume BRL)

---

### 3.2 **Trial → Paid (Conversão de Trial)**

**Cálculo proposto:**
```sql
SELECT 
  DATE_TRUNC('month', created_at) as cohort_month,
  COUNT(*) as trials_started,
  COUNT(*) FILTER (WHERE status = 'active') as converted_to_paid,
  100.0 * COUNT(*) FILTER (WHERE status = 'active') / COUNT(*) as conversion_rate_pct
FROM subscriptions
WHERE status IN ('trial', 'active')
GROUP BY cohort_month;
```

**Tabelas usadas:** `subscriptions`  
**Colunas essenciais:** subscriptions.status, subscriptions.created_at, subscriptions.trial_ends_at  
**Status:** ⚠️ **PARCIALMENTE SUPORTADO**

**Problema:**
- `subscriptions.status` tem valores: trial, active, past_due, cancelled, inactive
- Não há coluna `trial_ended_at` para rastrear quando transição ocorreu
- Não há coluna `converted_at` com timestamp de conversão
- Histórico de status não existe (sem audit table)

**GAP CRÍTICO:** Sem SCD Type 2 (status_history table), não posso calcular:
- Exato quando ocorreu conversão (apenas created_at original)
- Taxa de conversão real por cohort
- Tempo médio do trial até conversão

**Solução necessária:** 
1. Adicionar coluna `converted_at` em subscriptions
2. Ou criar tabela `subscription_status_history(id, subscription_id, old_status, new_status, changed_at)`

---

### 3.3 **Churn (Taxa de Cancelamento)**

**Cálculo proposto:**
```sql
SELECT 
  DATE_TRUNC('month', updated_at) as churn_month,
  COUNT(*) as churn_count,
  100.0 * COUNT(*) / LAG(COUNT(*)) OVER (ORDER BY DATE_TRUNC('month', updated_at)) as churn_rate_pct
FROM subscriptions
WHERE status = 'cancelled'
GROUP BY churn_month;
```

**Tabelas usadas:** `subscriptions`  
**Colunas essenciais:** subscriptions.status, subscriptions.updated_at  
**Status:** ⚠️ **PARCIALMENTE SUPORTADO**

**Problema:**
- Sem coluna `canceled_at` (usa updated_at, que pode ser impreciso)
- Sem coluna `cancellation_reason` (por que churned?)
- Sem tenure (tempo de vida da subscription até cancelamento)

**GAP CRÍTICO:** 
- updated_at é atualizado por qualquer mudança (trial_ends_at muda? updated_at muda?)
- Não é confiável para acompanhar exatamente quando status mudou

**Solução necessária:**
1. Adicionar `canceled_at` TIMESTAMP
2. Adicionar `cancellation_reason` VARCHAR (payment failure, user-initiated, etc.)
3. Criar subscription_status_history conforme 3.2

---

### 3.4 **ROAS (Return on Ad Spend)**

**Cálculo proposto:**
```sql
SELECT 
  c.id as campaign_id,
  c.name,
  (c.metrics->>'revenue')::numeric as revenue,
  (c.metrics->>'spend')::numeric as spend,
  ((c.metrics->>'revenue')::numeric / (c.metrics->>'spend')::numeric) as roas
FROM campaigns c
WHERE c.status = 'active'
  AND (c.metrics->>'spend')::numeric > 0;
```

**Tabelas usadas:** `campaigns`  
**Colunas essenciais:** campaigns.metrics (JSONB), campaigns.status, campaigns.created_at  
**Status:** ⚠️ **PRECÁRIO**

**Problema:**
- Revenue e spend estão em campaigns.metrics (JSONB não normalizado)
- Não há garantia de quais campos existem em JSONB
- Sem timestamp de quando metrics foram atualizadas
- Sem histórico de métricas (sobrescreve anterior)

**GAP CRÍTICO:**
- JSONB torna cálculos complexos e lentos
- Sem normalizando daily_metrics ou snapshot histórico
- Não sei se spend é total ou marginal

**Solução necessária:**
1. Criar tabela `campaign_metrics_daily(id, campaign_id, date, spend, revenue, clicks, impressions, conversions, created_at)`
2. Normalizar spend/revenue como colunas, não JSONB
3. Rastrear histórico (não sobrescrever)

---

### 3.5 **Campanhas Ativas (Active Campaigns Count)**

**Cálculo proposto:**
```sql
SELECT 
  DATE_TRUNC('day', c.created_at) as date,
  COUNT(*) as active_campaigns_count
FROM campaigns c
WHERE c.status = 'active'
  AND c.created_at::DATE <= '2026-06-28'::DATE
  AND (c.status = 'active' OR last_synced_at > NOW() - INTERVAL '24 hours')
GROUP BY date
ORDER BY date DESC;
```

**Tabelas usadas:** `campaigns`  
**Colunas essenciais:** campaigns.status, campaigns.created_at, campaigns.last_synced_at  
**Status:** ✅ **SUPORTADO**

**⚠️ Considerações:**
- "Ativo" = status = 'active'?
- Ou deve considerar last_synced_at (se não sincronizou em 24h, é realmente ativo?)
- Sem coluna de data de fim (end_date), não dá pra saber quando campanha terminou

---

### 3.6 **Distribuição de Grades (Performance Grade Distribution)**

**Cálculo proposto:**
```sql
SELECT 
  DATE_TRUNC('day', ps.computed_at) as date,
  ps.grade,
  COUNT(*) as count,
  100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY DATE_TRUNC('day', ps.computed_at)) as pct
FROM performance_scores ps
GROUP BY date, ps.grade
ORDER BY date DESC, ps.grade;
```

**Tabelas usadas:** `performance_scores`  
**Colunas essenciais:** performance_scores.grade, performance_scores.computed_at, performance_scores.campaign_id  
**Status:** ✅ **SUPORTADO**

**⚠️ Considerações:**
- Assume score = grade existe em performance_scores
- computed_at pode ter múltiplos registros por campaign (não deixa claro qual é o "latest")
- Sem clareza se score/grade sobrescreve ou accumula

---

### 3.7 **Latência p50/p95/p99 (Response Time Percentiles)**

**Cálculo proposto:**
```sql
SELECT 
  DATE_TRUNC('hour', rl.created_at) as hour,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY rl.response_time_ms) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.response_time_ms) as p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY rl.response_time_ms) as p99_ms,
  AVG(rl.response_time_ms) as avg_ms,
  MAX(rl.response_time_ms) as max_ms
FROM request_logs rl
WHERE rl.created_at > NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour DESC;
```

**Tabelas usadas:** `request_logs`  
**Colunas essenciais:** request_logs.response_time_ms, request_logs.created_at  
**Status:** ✅ **SUPORTADO**

**⚠️ Considerações:**
- request_logs.response_time_ms está em integer, adequado
- Índice (status_code, created_at DESC) é suficiente
- **Recomendação:** Implementar particionamento por data (crescimento de logs é exponencial)
- Considerar TTL: apagar logs > 30 dias?

---

### 3.8 **Taxa de Erros 4xx/5xx**

**Cálculo proposto:**
```sql
SELECT 
  DATE_TRUNC('minute', rl.created_at) as minute,
  SUM(CASE WHEN rl.status_code >= 400 AND rl.status_code < 500 THEN 1 ELSE 0 END) as errors_4xx,
  SUM(CASE WHEN rl.status_code >= 500 THEN 1 ELSE 0 END) as errors_5xx,
  COUNT(*) as total_requests,
  100.0 * (SUM(CASE WHEN rl.status_code >= 400 THEN 1 ELSE 0 END)) / COUNT(*) as error_rate_pct
FROM request_logs rl
WHERE rl.created_at > NOW() - INTERVAL '24 hours'
GROUP BY minute
ORDER BY minute DESC;
```

**Tabelas usadas:** `request_logs`  
**Colunas essenciais:** request_logs.status_code, request_logs.created_at, request_logs.tenant_id  
**Status:** ✅ **SUPORTADO**

**⚠️ Considerações:**
- Índice (status_code, created_at DESC) otimiza bem
- Considerar segmentar por tenant_id para isolamento de problemas
- **MISSING:** Sem categorização de erro type (é timeout? 400 validation? 500 server error?)

---

### 3.9 **Requests por Minuto (RPS)**

**Cálculo proposto:**
```sql
SELECT 
  DATE_TRUNC('minute', rl.created_at) as minute,
  COUNT(*) as request_count,
  COUNT(*) / 60.0 as rps
FROM request_logs rl
WHERE rl.created_at > NOW() - INTERVAL '24 hours'
GROUP BY minute
ORDER BY minute DESC;
```

**Tabelas usadas:** `request_logs`  
**Colunas essenciais:** request_logs.created_at  
**Status:** ✅ **SUPORTADO**

---

### 3.10 **Top Endpoints Lentos**

**Cálculo proposto:**
```sql
SELECT 
  COALESCE(rl.path_template, rl.path) as endpoint,
  COUNT(*) as request_count,
  AVG(rl.response_time_ms) as avg_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.response_time_ms) as p95_ms,
  MAX(rl.response_time_ms) as max_ms
FROM request_logs rl
WHERE rl.created_at > NOW() - INTERVAL '7 days'
GROUP BY COALESCE(rl.path_template, rl.path)
ORDER BY avg_time_ms DESC
LIMIT 20;
```

**Tabelas usadas:** `request_logs`  
**Colunas essenciais:** request_logs.path_template, request_logs.path, request_logs.response_time_ms, request_logs.created_at  
**Status:** ⚠️ **PARCIALMENTE SUPORTADO**

**Problema:**
- `path_template` é NULL para alguns requests (ver migration 0017 note)
- Sem separação de query params, tudo agrupado por path exato

**GAP:** Sem normalização de paths, dois requests para `/campaigns/123` e `/campaigns/456` aparecem como 2 diferentes

**Solução:** Garantir path_template preenchido no middleware de logging

---

### 3.11 **Tenants Ativos em 24h**

**Cálculo proposto:**
```sql
SELECT 
  COUNT(DISTINCT rl.tenant_id) as active_tenants_24h
FROM request_logs rl
WHERE rl.created_at > NOW() - INTERVAL '24 hours'
  AND rl.tenant_id IS NOT NULL;
```

**Tabelas usadas:** `request_logs`  
**Colunas essenciais:** request_logs.tenant_id, request_logs.created_at  
**Status:** ✅ **SUPORTADO**

**⚠️ Considerações:**
- Assume tenant_id preenchido em request_logs (pode ser NULL)
- Para maior precisão, usar user_id → tenant_id lookup, ou usar sessions table

---

### 3.12 **Automações por Dia (Automation Rules Criadas/Acionadas)**

**Cálculo proposto:**
```sql
SELECT 
  DATE_TRUNC('day', ar.created_at) as date,
  COUNT(DISTINCT ar.id) as automation_rules_created,
  COUNT(DISTINCT CASE WHEN ar.is_active THEN ar.id END) as automation_rules_active
FROM automation_rules ar
GROUP BY date
ORDER BY date DESC;
```

**Tabelas usadas:** `automation_rules`  
**Colunas essenciais:** automation_rules.created_at, automation_rules.is_active  
**Status:** ✅ **SUPORTADO**

**Para execução:**
```sql
SELECT 
  DATE_TRUNC('day', re.triggered_at) as date,
  COUNT(*) as automation_executions
FROM rule_executions re
GROUP BY date
ORDER BY date DESC;
```

**Tabelas usadas:** `rule_executions`  
**Status:** ✅ **SUPORTADO**

---

### 3.13 **Criativos Gerados**

**Cálculo proposto:**
```sql
SELECT 
  DATE_TRUNC('day', ca.created_at) as date,
  ca.type,
  COUNT(*) as creative_count,
  COUNT(*) FILTER (WHERE ca.compliance_status = 'approved') as approved_count,
  COUNT(*) FILTER (WHERE ca.compliance_status = 'rejected') as rejected_count
FROM creative_assets ca
GROUP BY date, ca.type
ORDER BY date DESC, ca.type;
```

**Tabelas usadas:** `creative_assets`  
**Colunas essenciais:** creative_assets.created_at, creative_assets.type, creative_assets.compliance_status  
**Status:** ✅ **SUPORTADO**

**⚠️ Considerações:**
- Sem coluna de modelo de IA usado (qual modelo gerou? GPT-4? Custom?)
- Sem link explícito para campaigns (como saber qual criativo foi para qual campanha?)

---

## 4. RESUMO DE GAPS E RECOMENDAÇÕES

### 4.1 Gaps Críticos (Afetam KPIs)

| KPI | Gap | Impacto | Solução |
|-----|-----|--------|---------|
| Trial → Paid | Sem `converted_at`, sem histórico de status | Não consegue calcular data exata de conversão | Adicionar `subscription_status_history` table |
| Churn | Sem `canceled_at`, sem `cancellation_reason` | updated_at impreciso, sem contexto de cancelamento | Adicionar colunas a `subscriptions` |
| ROAS | Spend/revenue em JSONB, sem histórico | Cálculos lentos, perda de dados históricos | Normalizar em `campaign_metrics_daily` |
| MRR | Sem currency | Assume BRL, falha em internacionalização | Adicionar coluna `currency` a `invoices` |
| Latência | Sem particionamento, sem TTL | Crescimento exponencial de dados | Implementar particionamento por data |
| Top Endpoints | path_template NULL, sem normalizando de params | Análise imprecisa | Garantir path_template sempre preenchido |
| Criativos | Sem FK de campaign, sem modelo de IA | Impossível rastrear qual criativo em qual campanha | Adicionar `campaign_id`, `ai_model` |

### 4.2 Gaps Menores (Nice-to-Have)

- `form_submissions`: Sem `time_to_completion`, sem `step_number`
- `subscriptions`: Sem `renewal_count`, sem coluna de próxima renovação
- `campaigns`: Sem `end_date`, sem `duration_days`
- `users`: Sem `last_activity_at`, sem `is_active`
- Sem table de `webhook_events` para rastrear sincronizações com Meta

### 4.3 Problemas de Normalização

**JSONBs que deveriam ser normalizados:**
1. `campaigns.metrics` → `campaign_metrics_daily` table
2. `campaigns.budget` → `campaign_budgets` (com histórico)
3. `client_goals.monthly_budget` → valores normalizados
4. `client_goals.target_cpa` → coluna numeric
5. `budget_optimizations.adjustments` → `budget_adjustment_items` table
6. `fury_insights.suggestion_data` → estrutura clara ou separate fields
7. `brand_kits.photo_urls` → `brand_kit_photos` table
8. `meta_connections.ad_accounts` → `meta_ad_accounts` table

**Impacto:** Queries complexas, difíceis de debugar, lenta performance em escala

---

## 5. RECOMENDAÇÃO PARA C1 IMPLEMENTATION

### 5.1 KPIs Imediatamente Implementáveis (Sem Mudanças de Schema)

✅ **Distribuição de Grades** - performance_scores já suporta  
✅ **Latência p50/p95/p99** - request_logs já suporta  
✅ **Taxa de Erros 4xx/5xx** - request_logs já suporta  
✅ **Requests por Minuto** - request_logs já suporta  
✅ **Tenants Ativos em 24h** - request_logs já suporta (com caveat tenant_id NULL)  
✅ **Automações por Dia** - automation_rules + rule_executions já suportam  
✅ **Criativos Gerados** - creative_assets já suporta  
✅ **Campanhas Ativas** - campaigns já suporta (com caveat: sem end_date)  

### 5.2 KPIs Que Precisam de Ajustes Menores

⚠️ **MRR** - Já suportado, mas adicionar `currency` é recomendado  
⚠️ **Top Endpoints Lentos** - Garantir path_template sempre preenchido  

### 5.3 KPIs Que Requerem Mudanças Significativas

🔴 **Trial → Paid** - Precisa de subscription_status_history  
🔴 **Churn** - Precisa de canceled_at, cancellation_reason  
🔴 **ROAS** - Precisa de campaign_metrics_daily normalizado  

### 5.4 Estratégia Recomendada para C1

1. **Phase 1 (MVP):** Implementar 8 KPIs "green" (imediatamente disponíveis)
2. **Phase 2:** Adicionar migrations para subscription_status_history, canceled_at
3. **Phase 3:** Normalizar campaign_metrics_daily
4. **Futuro:** Refatorar JSONBs, adicionar particionamento

---

## 6. APÊNDICE: SCHEMA VISUAL

```
┌─────────────────────────────────────────────────────────────┐
│                        TENANTS (root)                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
    ┌────────┐        ┌──────────┐      ┌─────────────┐
    │ USERS  │        │CAMPAIGNS │      │SUBSCRIPTIONS│──────┐
    └────────┘        └──────────┘      └─────────────┘      │
                            │                    │            │
                ┌───────────┼────────┐          ▼            │
                │           │        │      ┌────────┐        │
                ▼           ▼        ▼      │INVOICES│        │
           ┌────────┐  ┌───────┐  ┌──────┐ └────────┘        │
           │INSIGHTS│  │SCORES │  │RULES │                   │
           └────────┘  └───────┘  └──────┘                   │
                                       │                      │
                                       ▼                      │
                                  ┌──────────┐                │
                                  │EXECUTIONS│                │
                                  └──────────┘                │
                                                              │
                  ┌───────────────────────────────────────────┘
                  │
                  ▼
            ┌──────────┐
            │ PLANS    │
            └──────────┘

┌────────────────────────────────────────┐
│   CREATIVE_ASSETS    CLIENT_GOALS      │
│   FURY_CONFIG        BRAND_KITS        │
│   META_CONNECTIONS   AUTOMATION_RULES  │
│   PERFORMANCE_RULES  BUDGET_OPTIMIZATIONS
│   REQUEST_LOGS       FORM_SUBMISSIONS  │
└────────────────────────────────────────┘
```

---

**Análise finalizada:** 2026-06-28  
**Próximo passo:** Discussão sobre phase 1 (MVP) vs necessidade de migrations imediatas
