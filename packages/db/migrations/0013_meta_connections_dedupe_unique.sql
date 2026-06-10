-- Add updated_at column
ALTER TABLE "meta_connections"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint

-- Deduplicate: keep only the most recent row per tenant_id
DELETE FROM "meta_connections" a
  USING "meta_connections" b
  WHERE a.tenant_id = b.tenant_id
    AND a.created_at < b.created_at;
--> statement-breakpoint

-- In case of ties on created_at, keep only the row with the highest id
DELETE FROM "meta_connections" a
  USING "meta_connections" b
  WHERE a.tenant_id = b.tenant_id
    AND a.created_at = b.created_at
    AND a.id < b.id;
--> statement-breakpoint

-- Enforce one connection per tenant going forward
DO $$ BEGIN
  ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_tenant_id_unique" UNIQUE ("tenant_id");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
