-- Persistência por campanha/dia para manter filtros de período sem novas
-- consultas à Meta no carregamento das telas.
CREATE TABLE IF NOT EXISTS meta_campaign_daily_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meta_campaign_id varchar(255) NOT NULL,
  date date NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_campaign_daily_insights_tenant_campaign_date_unique
    UNIQUE (tenant_id, meta_campaign_id, date)
);
CREATE INDEX IF NOT EXISTS meta_campaign_daily_insights_tenant_date_idx
  ON meta_campaign_daily_insights (tenant_id, date);
ALTER TABLE meta_campaign_daily_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_campaign_daily_insights_tenant_isolation ON meta_campaign_daily_insights
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
