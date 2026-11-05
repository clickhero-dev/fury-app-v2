CREATE TABLE IF NOT EXISTS "meta_sync_scopes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "connection_id" uuid NOT NULL REFERENCES "meta_connections"("id") ON DELETE CASCADE,
  "meta_user_id" varchar(255) NOT NULL, "ad_account_id" varchar(255) NOT NULL,
  "instagram_user_id" varchar(255), "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "meta_sync_scopes_tenant_unique" UNIQUE ("tenant_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_sync_scopes_connection_id_idx" ON "meta_sync_scopes" ("connection_id");
--> statement-breakpoint
ALTER TABLE "meta_campaign_snapshots" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
ALTER TABLE "meta_campaign_daily_insights" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
ALTER TABLE "meta_leads" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
ALTER TABLE "meta_instagram_media" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
ALTER TABLE "meta_sync_runs" ADD COLUMN IF NOT EXISTS "scope_id" uuid;
--> statement-breakpoint
INSERT INTO "meta_sync_scopes" ("tenant_id", "connection_id", "meta_user_id", "ad_account_id", "instagram_user_id")
SELECT mc."tenant_id", mc."id", mc."meta_user_id", mc."selected_ad_account_id", mc."selected_instagram_user_id" FROM "meta_connections" mc
WHERE mc."selected_ad_account_id" IS NOT NULL ON CONFLICT ("tenant_id") DO NOTHING;
--> statement-breakpoint
UPDATE "meta_campaign_snapshots" p SET "scope_id"=s."id" FROM "meta_sync_scopes" s WHERE p."tenant_id"=s."tenant_id" AND p."scope_id" IS NULL;
UPDATE "meta_campaign_daily_insights" p SET "scope_id"=s."id" FROM "meta_sync_scopes" s WHERE p."tenant_id"=s."tenant_id" AND p."scope_id" IS NULL;
UPDATE "meta_leads" p SET "scope_id"=s."id" FROM "meta_sync_scopes" s WHERE p."tenant_id"=s."tenant_id" AND p."scope_id" IS NULL;
UPDATE "meta_instagram_media" p SET "scope_id"=s."id" FROM "meta_sync_scopes" s WHERE p."tenant_id"=s."tenant_id" AND p."scope_id" IS NULL;
UPDATE "meta_sync_runs" p SET "scope_id"=s."id" FROM "meta_sync_scopes" s WHERE p."tenant_id"=s."tenant_id" AND p."scope_id" IS NULL;
--> statement-breakpoint
DELETE FROM "meta_campaign_snapshots" WHERE "scope_id" IS NULL; DELETE FROM "meta_campaign_daily_insights" WHERE "scope_id" IS NULL;
DELETE FROM "meta_leads" WHERE "scope_id" IS NULL; DELETE FROM "meta_instagram_media" WHERE "scope_id" IS NULL;
ALTER TABLE "meta_campaign_snapshots" ALTER COLUMN "scope_id" SET NOT NULL; ALTER TABLE "meta_campaign_daily_insights" ALTER COLUMN "scope_id" SET NOT NULL;
ALTER TABLE "meta_leads" ALTER COLUMN "scope_id" SET NOT NULL; ALTER TABLE "meta_instagram_media" ALTER COLUMN "scope_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "meta_campaign_snapshots" ADD CONSTRAINT "meta_campaign_snapshots_scope_fk" FOREIGN KEY ("scope_id") REFERENCES "meta_sync_scopes"("id") ON DELETE CASCADE;
  ALTER TABLE "meta_campaign_daily_insights" ADD CONSTRAINT "meta_campaign_daily_insights_scope_fk" FOREIGN KEY ("scope_id") REFERENCES "meta_sync_scopes"("id") ON DELETE CASCADE;
  ALTER TABLE "meta_leads" ADD CONSTRAINT "meta_leads_scope_fk" FOREIGN KEY ("scope_id") REFERENCES "meta_sync_scopes"("id") ON DELETE CASCADE;
  ALTER TABLE "meta_instagram_media" ADD CONSTRAINT "meta_instagram_media_scope_fk" FOREIGN KEY ("scope_id") REFERENCES "meta_sync_scopes"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_campaign_snapshots_scope_id_idx" ON "meta_campaign_snapshots" ("scope_id"); CREATE INDEX IF NOT EXISTS "meta_campaign_daily_insights_scope_id_idx" ON "meta_campaign_daily_insights" ("scope_id");
CREATE INDEX IF NOT EXISTS "meta_leads_scope_id_idx" ON "meta_leads" ("scope_id"); CREATE INDEX IF NOT EXISTS "meta_instagram_media_scope_id_idx" ON "meta_instagram_media" ("scope_id"); CREATE INDEX IF NOT EXISTS "meta_sync_runs_scope_id_idx" ON "meta_sync_runs" ("scope_id");
--> statement-breakpoint
ALTER TABLE "meta_sync_scopes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_sync_scopes_tenant_isolation ON meta_sync_scopes USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
