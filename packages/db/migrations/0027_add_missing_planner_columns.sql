ALTER TABLE "campaign_plans" ADD COLUMN IF NOT EXISTS "strategy" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "campaign_plans" ADD COLUMN IF NOT EXISTS "research_data" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "campaign_plans" ADD COLUMN IF NOT EXISTS "analytics_data" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "campaign_plans" ADD COLUMN IF NOT EXISTS "branding_checked" boolean DEFAULT false;
ALTER TABLE "campaign_plans" ADD COLUMN IF NOT EXISTS "branding_notes" text;
