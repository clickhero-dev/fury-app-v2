ALTER TABLE "creative_assets" ADD COLUMN IF NOT EXISTS "cost_usd" numeric(10, 6);
ALTER TABLE "creative_assets" ADD COLUMN IF NOT EXISTS "processing_time_ms" integer;