-- Brand kit enum
DO $$ BEGIN
  CREATE TYPE "voice_tone" AS ENUM ('professional', 'casual', 'urgent', 'premium');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Brand kits table
CREATE TABLE IF NOT EXISTS "brand_kits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL UNIQUE,
  "logo_url" text,
  "primary_color" varchar(7),
  "secondary_color" varchar(7),
  "voice_tone" "voice_tone",
  "photo_urls" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Foreign key
DO $$ BEGIN
  ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Index
CREATE INDEX IF NOT EXISTS "brand_kits_tenant_id_idx" ON "brand_kits" ("tenant_id");
