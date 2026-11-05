# 📊 FURY Observabilidade — Definição de KPIs

> Documento auto-contido de KPIs de negócio e técnicos do Click Hero.
> **Princípio KISS**: queries SQL diretas, sem views, prontas para colar no Grafana.
> Use `$__timeFilter(created_at)` nos dashboards para ranges de data.

---

## 🔧 Conexão

```
Host: fury-postgres:5432 (Docker) ou localhost:5444
Database: fury_dev (dev) / fury_prod (prod)
User: fury / admin
```

---

## 📈 KPIs de Negócio

### B1 — Total de Campanhas por Status
**Objetivo:** Visão geral do pipeline de campanhas.
```sql
SELECT
  status,
  COUNT(*) AS total
FROM campaigns
WHERE $__timeFilter(created_at)
GROUP BY status
ORDER BY total DESC;
```

### B2 — ROAS Médio por Tenant (último mês)
**Objetivo:** Eficiência do investimento em anúncios.
```sql
SELECT
  t.name AS tenant,
  ROUND(AVG(COALESCE((ps.metrics_snapshot->>'roas')::numeric, 0)), 2) AS avg_roas
FROM performance_scores ps
JOIN campaigns c ON c.id = ps.campaign_id
JOIN tenants t ON t.id = ps.tenant_id
WHERE $__timeFilter(ps.computed_at)
GROUP BY t.name
ORDER BY avg_roas DESC;
```

### B3 — Gasto Total por Período
**Objetivo:** Volume financeiro movimentado.
```sql
SELECT
  DATE_TRUNC('day', ps.computed_at) AS day,
  SUM(COALESCE((ps.metrics_snapshot->>'spend')::numeric, 0)) AS total_spend
FROM performance_scores ps
WHERE $__timeFilter(ps.computed_at)
GROUP BY day
ORDER BY day;
```

### B4 — Distribuição de Notas de Performance (A-F)
**Objetivo:** Saúde geral das campanhas ativas.
```sql
SELECT
  grade,
  COUNT(*) AS total
FROM performance_scores ps
JOIN campaigns c ON c.id = ps.campaign_id
WHERE c.status = 'active'
  AND $__timeFilter(ps.computed_at)
GROUP BY grade
ORDER BY
  CASE grade
    WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3
    WHEN 'D' THEN 4 WHEN 'F' THEN 5
  END;
```

### B5 — CPA Médio por Tenant
**Objetivo:** Custo por aquisição, métrica central de eficiência.
```sql
SELECT
  t.name AS tenant,
  ROUND(AVG(COALESCE((ps.metrics_snapshot->>'cpa')::numeric, 0)), 2) AS avg_cpa
FROM performance_scores ps
JOIN tenants t ON t.id = ps.tenant_id
WHERE $__timeFilter(ps.computed_at)
GROUP BY t.name
ORDER BY avg_cpa ASC;
```

### B6 — CTR Médio por Tenant
**Objetivo:** Qualidade do engajamento com anúncios.
```sql
SELECT
  t.name AS tenant,
  ROUND(AVG(COALESCE((ps.metrics_snapshot->>'ctr')::numeric, 0)), 2) AS avg_ctr
FROM performance_scores ps
JOIN tenants t ON t.id = ps.tenant_id
WHERE $__timeFilter(ps.computed_at)
GROUP BY t.name
ORDER BY avg_ctr DESC;
```

### B7 — Total de Campanhas Ativas com Budget
**Objetivo:** Quantas campanhas estão rodando e seu investimento.
```sql
SELECT
  t.name AS tenant,
  COUNT(*) AS active_campaigns,
  SUM(COALESCE((c.budget->>'daily_budget')::numeric, 0)) AS total_daily_budget
FROM campaigns c
JOIN tenants t ON t.id = c.tenant_id
WHERE c.status = 'active'
GROUP BY t.name
ORDER BY total_daily_budget DESC;
```

### B8 — MRR (Receita Recorrente Mensal)
**Objetivo:** Saúde financeira do negócio.
```sql
SELECT
  s.status,
  COUNT(*) AS subscriptions,
  COALESCE(SUM(p.price_cents) / 100.0, 0) AS mrr_reais
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id
WHERE s.status IN ('active', 'trial', 'past_due')
GROUP BY s.status
ORDER BY mrr_reais DESC;
```

### B9 — Trial Conversion Rate
**Objetivo:** Taxa de conversão de trial → paid.
```sql
SELECT
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE s.status = 'active')
    / NULLIF(COUNT(*), 0),
    1
  ) AS conversion_pct
FROM subscriptions s
WHERE s.trial_ends_at IS NOT NULL
  AND $__timeFilter(s.created_at);
```

### B10 — Form Submissions por Tipo e Status
**Objetivo:** Funil de onboarding / conversão de formulários.
```sql
SELECT
  form_type,
  status,
  COUNT(*) AS total
FROM form_submissions
WHERE $__timeFilter(created_at)
GROUP BY form_type, status
ORDER BY form_type, total DESC;
```

### B11 — Regras de Automação Ativas vs Inativas
**Objetivo:** Quantas automações estão operando.
```sql
SELECT
  t.name AS tenant,
  COUNT(*) FILTER (WHERE ar.is_active = true) AS active_rules,
  COUNT(*) FILTER (WHERE ar.is_active = false) AS inactive_rules
FROM automation_rules ar
JOIN tenants t ON t.id = ar.tenant_id
GROUP BY t.name
ORDER BY active_rules DESC;
```

### B12 — Metas de Clientes (Goals Progress)
**Objetivo:** Progresso em direção às metas definidas.
```sql
SELECT
  t.name AS tenant,
  cg.objective,
  cg.monthly_budget->>'amount' AS budget,
  cg.target_cpa->>'value' AS target_cpa
FROM client_goals cg
JOIN tenants t ON t.id = cg.tenant_id
ORDER BY t.name;
```

---

## ⚙️ KPIs Técnicos

### T1 — Volume de Requisições (RPS)
**Objetivo:** Throughput da API — pico e tendência.
```sql
SELECT
  DATE_TRUNC('minute', created_at) AS minute,
  COUNT(*) AS requests
FROM request_logs
WHERE $__timeFilter(created_at)
GROUP BY minute
ORDER BY minute;
```

### T2 — Latência Média por Rota
**Objetivo:** Identificar endpoints lentos.
```sql
SELECT
  method || ' ' || path AS endpoint,
  COUNT(*) AS calls,
  ROUND(AVG(response_time_ms)::numeric, 1) AS avg_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 1) AS p95_ms,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 1) AS p99_ms
FROM request_logs
WHERE $__timeFilter(created_at)
GROUP BY endpoint
ORDER BY avg_ms DESC
LIMIT 20;
```

### T3 — Taxa de Erro (5xx)
**Objetivo:** Disponibilidade da API.
```sql
SELECT
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status_code >= 500) AS errors,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status_code >= 500) / NULLIF(COUNT(*), 0), 2) AS error_pct
FROM request_logs
WHERE $__timeFilter(created_at)
GROUP BY hour
ORDER BY hour;
```

### T4 — Distribuição de Status Codes
**Objetivo:** Visão geral do tráfego.
```sql
SELECT
  status_code,
  COUNT(*) AS total
FROM request_logs
WHERE $__timeFilter(created_at)
GROUP BY status_code
ORDER BY status_code;
```

### T5 — Top Tenants por Volume de Requisições
**Objetivo:** Quem mais usa a plataforma.
```sql
SELECT
  COALESCE(t.name, 'anonymous') AS tenant,
  COUNT(*) AS requests
FROM request_logs rl
LEFT JOIN tenants t ON t.id = rl.tenant_id
WHERE $__timeFilter(rl.created_at)
GROUP BY t.name
ORDER BY requests DESC
LIMIT 10;
```

### T6 — Regras Executadas (Disparos de Automação)
**Objetivo:** Atividade do engine de regras.
```sql
SELECT
  DATE_TRUNC('hour', triggered_at) AS hour,
  COUNT(*) AS executions,
  COUNT(DISTINCT rule_id) AS unique_rules
FROM rule_executions
WHERE $__timeFilter(triggered_at)
GROUP BY hour
ORDER BY hour;
```

### T7 — Taxa de Abandono de Formulários
**Objetivo:** Qualidade da experiência de onboarding.
```sql
SELECT
  form_type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
  COUNT(*) FILTER (WHERE status = 'ABANDONED') AS abandoned,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'ABANDONED') / NULLIF(COUNT(*), 0), 1) AS abandon_pct
FROM form_submissions
WHERE $__timeFilter(created_at)
GROUP BY form_type
ORDER BY total DESC;
```

### T8 — Meta Connections Ativas
**Objetivo:** Contas Meta conectadas por tenant.
```sql
SELECT
  t.name AS tenant,
  COUNT(*) AS connections,
  COUNT(*) FILTER (WHERE mc.token_expires_at > NOW()) AS valid_tokens
FROM meta_connections mc
JOIN tenants t ON t.id = mc.tenant_id
GROUP BY t.name
ORDER BY connections DESC;
```

### T9 — Criativos por Status de Compliance
**Objetivo:** Pipeline de aprovação de criativos.
```sql
SELECT
  compliance_status,
  COUNT(*) AS total
FROM creative_assets
WHERE $__timeFilter(created_at)
GROUP BY compliance_status
ORDER BY total DESC;
```

### T10 — Performance Insights Gerados
**Objetivo:** Atividade do FURY engine de sugestões.
```sql
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS insights,
  COUNT(DISTINCT campaign_id) AS campaigns_affected
FROM fury_insights
WHERE $__timeFilter(created_at)
GROUP BY day
ORDER BY day;
```

---

## 🧪 Verificação Rápida

Para testar se as queries funcionam no psql:

```bash
# Testa as 3 queries principais
PGPASSWORD='fury_local' psql -h localhost -p 5432 -U fury -d fury_dev << 'SQL'
-- B1: Campanhas por status
SELECT status, COUNT(*) FROM campaigns GROUP BY status;

-- T1: Volume de requisições (última hora)
SELECT COUNT(*) AS requests_last_hour
FROM request_logs
WHERE created_at > NOW() - INTERVAL '1 hour';

-- T3: Taxa de erro (últimas 24h)
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status_code >= 500) AS errors
FROM request_logs
WHERE created_at > NOW() - INTERVAL '24 hours';
SQL
```

---

## 📝 Notas

- **SEM views**: queries diretas, copiáveis para o Grafana.
- **`$__timeFilter(col)`**: placeholder do Grafana que expande para `col BETWEEN 'start' AND 'end'`.
- **Cache:** endpoint de métricas usa cache de 60s (Redis ou in-memory).
- **Performance:** todas as queries usam índices existentes do schema (ver `schema.ts`).
- **Ordem de execução no Grafana:** C3 (negócio) → C4 (técnico) → C5 (alertas).
