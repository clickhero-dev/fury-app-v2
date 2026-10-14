-- Último healthcheck da integração Meta por tenant.
CREATE TABLE IF NOT EXISTS "meta_healthchecks" (
  "tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
  "checked_at" timestamptz NOT NULL,
  "status" varchar(16) NOT NULL,
  "checks" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "last_sync_at" timestamptz,
  "last_sync_status" varchar(16)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_healthchecks_checked_at_idx" ON "meta_healthchecks" ("checked_at");
