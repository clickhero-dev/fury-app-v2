# Data Model: 014 — metrics_daily

## Tabela `metrics_daily`

1 linha = **1 tenant × 1 campanha Meta × 1 dia**.

```sql
CREATE TABLE IF NOT EXISTS "metrics_daily" (
  "tenant_id"        uuid         NOT NULL,
  "campaign_meta_id" varchar(64)  NOT NULL,          -- id da campanha NA META (sem FK)
  "date"             date         NOT NULL,          -- date_start do insight (dia Meta)
  "campaign_name"    varchar(255),                    -- snapshot p/ listagem sem join
  "objective"        varchar(64),                     -- snapshot do objective (paridade do parse)
  "spend"            numeric(14,2) NOT NULL DEFAULT 0, -- R$
  "impressions"      integer       NOT NULL DEFAULT 0,
  "clicks"           integer       NOT NULL DEFAULT 0,
  "ctr"              numeric(10,4) NOT NULL DEFAULT 0,
  "cpm"              numeric(14,4) NOT NULL DEFAULT 0,
  "cpc"              numeric(14,4) NOT NULL DEFAULT 0,
  "conversions"      numeric(14,4) NOT NULL DEFAULT 0, -- já normalizado (objective-aware, R2)
  "roas"             numeric(10,4),
  "cpa"              numeric(14,4),
  "updated_at"       timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY ("tenant_id", "campaign_meta_id", "date")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metrics_daily_tenant_date_idx" ON "metrics_daily" ("tenant_id", "date");
--> statement-breakpoint
ALTER TABLE "metrics_daily" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY metrics_daily_tenant_isolation ON "metrics_daily"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### Decisões de modelagem

| Decisão | Motivo |
|---|---|
| PK composta, sem `id` serial | upsert natural por (tenant, campaign, date); sem chance de duplicata |
| `campaign_meta_id` varchar **sem FK** | campanhas podem existir só na Meta (não criadas pelo wizard) — FK em `campaigns` invalidaria linhas legítimas |
| `conversions` numérico **já normalizado** | paridade Dashboard↔Campanhas por construção (critério objective-aware aplicado no sync) |
| `campaign_name`/`objective` snapshot | listagem `/metrics/campaigns` não precisa bater na Meta p/ nomes; objective necessário p/ re-normalização se reprocessar |
| `numeric` não float | dinheiro; paridade com centavos (spend em R$, 2 casas) |
| RLS policy padrão do repo | constituição I |

### Drizzle (schema.ts)

```ts
export const metricsDaily = pgTable('metrics_daily', {
  tenantId: uuid('tenant_id').notNull(),
  campaignMetaId: varchar('campaign_meta_id', { length: 64 }).notNull(),
  date: date('date').notNull(),
  campaignName: varchar('campaign_name', { length: 255 }),
  objective: varchar('objective', { length: 64 }),
  spend: numeric('spend', { precision: 14, scale: 2 }).notNull().default('0'),
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  ctr: numeric('ctr', { precision: 10, scale: 4 }).notNull().default('0'),
  cpm: numeric('cpm', { precision: 14, scale: 4 }).notNull().default('0'),
  cpc: numeric('cpc', { precision: 14, scale: 4 }).notNull().default('0'),
  conversions: numeric('conversions', { precision: 14, scale: 4 }).notNull().default('0'),
  roas: numeric('roas', { precision: 10, scale: 4 }),
  cpa: numeric('cpa', { precision: 14, scale: 4 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.tenantId, table.campaignMetaId, table.date] }),
  tenantDateIdx: index('metrics_daily_tenant_date_idx').on(table.tenantId, table.date),
}));
```

## Agregações que os endpoints farão (todas ≥ index (tenant_id, date))

| Endpoint | Query em metrics_daily |
|---|---|
| `/metrics/summary` | `SUM(spend), SUM(conversions), SUM(action_values→roas calc), CPA=spend/conversions WHERE tenant AND date BETWEEN` |
| `/metrics/daily` | `GROUP BY date` no mesmo WHERE (série) |
| `/metrics/campaigns` | `GROUP BY campaign_meta_id` + status da Meta/DB local (mantém comportamento: status live via lista de campanhas já buscada em sync ou DB local) |
| `/campaigns/:id/insights` | `WHERE campaign_meta_id = X AND date BETWEEN` → timeseries + totais (creatives seguem live, research R1) |
| `/goals/progress` | reusa summary/daily acima |

**Nota ROAS**: summary atual calcula ROAS de `action_values/spend` por campanha e agrega; com grão diário gravamos `roas` por linha (campanha-dia). Paridade da agregação (ponderação) validada no teste R2 — se necessário, gravamos também `action_values` p/ somar antes de dividir.

## Status de campanha na listagem (hoje vem da Meta)

Sync grava `campaign_name`/`objective` snapshot; **status** continua vindo da lista de campanhas da conta (chamada leve `fields=id,name,status,objective` no mesmo ciclo do job — 1 chamada extra por tenant, ainda 2/tenant/ciclo) ou do DB local quando existir. `status` NÃO vai para `metrics_daily` (mutável, grão errado); listagem junta status live + métricas pré-processadas.
