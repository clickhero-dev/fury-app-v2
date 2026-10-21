-- Migration 0051: Google Ads — promoção do perfil GBP (Fluxo 3)
-- Colunas de campanha no google_business_profiles + escopos OAuth no google_connections.

-- Escopos OAuth concedidos na conexão (ex.: business.manage, adwords)
ALTER TABLE "google_connections" ADD COLUMN IF NOT EXISTS "scopes" jsonb DEFAULT '[]'::jsonb;

-- Campanha Google Ads do perfil (campaign + budget + status de veiculação)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'google_ads_campaign_status') THEN
    CREATE TYPE "google_ads_campaign_status" AS ENUM ('ENABLED', 'PAUSED', 'REMOVED', 'UNKNOWN');
  END IF;
END $$;

ALTER TABLE "google_business_profiles" ADD COLUMN IF NOT EXISTS "ads_campaign_id" VARCHAR(255);
ALTER TABLE "google_business_profiles" ADD COLUMN IF NOT EXISTS "ads_campaign_status" "google_ads_campaign_status";
ALTER TABLE "google_business_profiles" ADD COLUMN IF NOT EXISTS "ads_monthly_budget" NUMERIC(12, 2);
ALTER TABLE "google_business_profiles" ADD COLUMN IF NOT EXISTS "ads_budget_micros" BIGINT;
ALTER TABLE "google_business_profiles" ADD COLUMN IF NOT EXISTS "ads_served_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "google_business_profiles_ads_campaign_id_idx"
  ON "google_business_profiles" ("ads_campaign_id")
  WHERE "ads_campaign_id" IS NOT NULL;