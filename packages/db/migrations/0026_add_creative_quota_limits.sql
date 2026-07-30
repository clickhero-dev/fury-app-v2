ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "limits" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "creatives_remaining" integer;

ALTER TABLE "creative_assets"
  ADD COLUMN IF NOT EXISTS "root_asset_id" uuid;

ALTER TABLE "creative_assets"
  ADD COLUMN IF NOT EXISTS "modifications_remaining" integer;

DO $$ BEGIN
  ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_root_asset_id_creative_assets_id_fk"
    FOREIGN KEY ("root_asset_id") REFERENCES "creative_assets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "creative_assets_root_asset_id_idx" ON "creative_assets" ("root_asset_id");
