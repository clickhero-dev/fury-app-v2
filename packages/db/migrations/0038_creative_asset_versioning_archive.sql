ALTER TABLE "creative_assets"
  ADD COLUMN IF NOT EXISTS "active_asset_id" uuid;

ALTER TABLE "creative_assets"
  ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

DO $$ BEGIN
  ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_active_asset_id_creative_assets_id_fk"
    FOREIGN KEY ("active_asset_id") REFERENCES "creative_assets"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "creative_assets_active_asset_id_idx" ON "creative_assets" ("active_asset_id");
