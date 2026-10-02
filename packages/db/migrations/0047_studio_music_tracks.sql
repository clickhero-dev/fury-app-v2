-- Músicas de fundo do tenant para vídeos (MoneyPrinterTurbo)
CREATE TABLE IF NOT EXISTS "studio_music_tracks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "mpt_file" varchar(255) NOT NULL,
  "preview_url" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "studio_music_tracks" ADD CONSTRAINT "studio_music_tracks_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "studio_music_tracks_tenant_id_idx" ON "studio_music_tracks" ("tenant_id");
