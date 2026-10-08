-- Migration 0049: biblioteca de imagens do Estúdio com tipo (modelo/produto/equipe) e soft delete

DO $$ BEGIN
  CREATE TYPE "brand_kit_photo_kind" AS ENUM ('modelo', 'produto', 'equipe');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_kit_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "brand_kit_id" uuid NOT NULL REFERENCES "brand_kits"("id") ON DELETE CASCADE,
  "kind" brand_kit_photo_kind NOT NULL,
  "url" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);
--> statement-breakpoint
-- banco que já criou a tabela sem a coluna (idempotente)
ALTER TABLE "brand_kit_photos" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_kit_photos_tenant_kind_idx" ON "brand_kit_photos" ("tenant_id", "kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_kit_photos_brand_kit_id_idx" ON "brand_kit_photos" ("brand_kit_id");
--> statement-breakpoint
-- listagens só leem as ativas
CREATE INDEX IF NOT EXISTS "brand_kit_photos_active_tenant_kind_idx"
  ON "brand_kit_photos" ("tenant_id", "kind") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
-- RLS no padrão do projeto (enable_rls.sql): tenant isolation via app.current_tenant_id
ALTER TABLE "brand_kit_photos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY brand_kit_photos_tenant_isolation ON brand_kit_photos
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
