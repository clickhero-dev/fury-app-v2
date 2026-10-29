ALTER TABLE "brand_kit_photos" ADD COLUMN IF NOT EXISTS "hidden_from_reference_panel" boolean NOT NULL DEFAULT false;
