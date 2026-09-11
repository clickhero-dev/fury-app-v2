-- Migration 0038: metrics_daily — rollup diário de insights Meta (feature 014)
-- 1 linha = 1 tenant × 1 campanha Meta × 1 dia.
-- campaign_meta_id é o ID DA META (sem FK): campanhas podem existir só na Meta.
-- conversions é gravado JÁ NORMALIZADO (critério objective-aware do sync) para
-- paridade Dashboard ↔ Campanhas por construção.

CREATE TABLE IF NOT EXISTS "metrics_daily" (
  "tenant_id"        uuid          NOT NULL,
  "campaign_meta_id" varchar(64)   NOT NULL,
  "date"             date          NOT NULL,
  "campaign_name"    varchar(255),
  "objective"        varchar(64),
  "spend"            numeric(14,2) NOT NULL DEFAULT 0,
  "impressions"      integer       NOT NULL DEFAULT 0,
  "clicks"           integer       NOT NULL DEFAULT 0,
  "ctr"              numeric(10,4) NOT NULL DEFAULT 0,
  "cpm"              numeric(14,4) NOT NULL DEFAULT 0,
  "cpc"              numeric(14,4) NOT NULL DEFAULT 0,
  "conversions"      numeric(14,4) NOT NULL DEFAULT 0,
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
