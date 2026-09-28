-- Migration 0043: Sync assíncrono Meta (fluxo de dados v2) — snapshots de campanhas,
-- leads, mídia Instagram e runs de sincronização (plan fluxo-dados-meta-assincrono).
-- Upserts idempotentes via UNIQUE (tenant_id, <meta id>) — ON CONFLICT no repository.

CREATE TYPE "meta_sync_run_status" AS ENUM ('running', 'success', 'partial', 'failed');
--> statement-breakpoint
-- Snapshot das campanhas da conta Meta (todas, inclusive criadas fora do Fury).
CREATE TABLE IF NOT EXISTS "meta_campaign_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "meta_campaign_id" varchar(255) NOT NULL,
  "name" varchar(255) NOT NULL,
  "status" varchar(50),
  "objective" varchar(50),
  "budget" jsonb DEFAULT '{}'::jsonb,
  "metrics" jsonb DEFAULT '{}'::jsonb,
  "has_lead_form" boolean NOT NULL DEFAULT false,
  "last_insights_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "meta_campaign_snapshots_tenant_campaign_unique" UNIQUE ("tenant_id", "meta_campaign_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_campaign_snapshots_tenant_id_idx" ON "meta_campaign_snapshots" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_campaign_snapshots_status_idx" ON "meta_campaign_snapshots" ("status");
--> statement-breakpoint
-- Leads coletados dos formulários Meta (dedupe por meta_lead_id por tenant).
CREATE TABLE IF NOT EXISTS "meta_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "meta_lead_id" varchar(255) NOT NULL,
  "snapshot_id" uuid REFERENCES "meta_campaign_snapshots"("id") ON DELETE CASCADE,
  "meta_campaign_id" varchar(255),
  "name" text,
  "email" text,
  "phone" text,
  "created_time" timestamptz,
  "fetched_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "meta_leads_tenant_lead_unique" UNIQUE ("tenant_id", "meta_lead_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_leads_tenant_id_idx" ON "meta_leads" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_leads_snapshot_id_idx" ON "meta_leads" ("snapshot_id");
--> statement-breakpoint
-- Mídia Instagram (orgânica) com insights por media.
CREATE TABLE IF NOT EXISTS "meta_instagram_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "media_id" varchar(255) NOT NULL,
  "caption" text,
  "media_url" text,
  "thumbnail_url" text,
  "media_type" varchar(32),
  "media_product_type" varchar(32),
  "timestamp" timestamptz,
  "like_count" integer,
  "comments_count" integer,
  "insights" jsonb DEFAULT '{}'::jsonb,
  "fetched_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "meta_instagram_media_tenant_media_unique" UNIQUE ("tenant_id", "media_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_instagram_media_tenant_id_idx" ON "meta_instagram_media" ("tenant_id");
--> statement-breakpoint
-- Runs de sincronização: status, erro client-safe e contagens.
CREATE TABLE IF NOT EXISTS "meta_sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "finished_at" timestamptz,
  "status" meta_sync_run_status NOT NULL DEFAULT 'running',
  "error_code" varchar(64),
  "error_message" text,
  "partial_failures" jsonb DEFAULT '[]'::jsonb,
  "campaigns_count" integer NOT NULL DEFAULT 0,
  "leads_count" integer NOT NULL DEFAULT 0,
  "insights_count" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_sync_runs_tenant_id_idx" ON "meta_sync_runs" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_sync_runs_tenant_started_idx" ON "meta_sync_runs" ("tenant_id", "started_at");
--> statement-breakpoint
-- RLS no padrão do projeto (enable_rls.sql): tenant isolation via app.current_tenant_id
ALTER TABLE "meta_campaign_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY meta_campaign_snapshots_tenant_isolation ON meta_campaign_snapshots
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint
ALTER TABLE "meta_leads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY meta_leads_tenant_isolation ON meta_leads
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint
ALTER TABLE "meta_instagram_media" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY meta_instagram_media_tenant_isolation ON meta_instagram_media
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint
ALTER TABLE "meta_sync_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY meta_sync_runs_tenant_isolation ON meta_sync_runs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);