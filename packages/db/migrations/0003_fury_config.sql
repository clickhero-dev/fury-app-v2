CREATE TABLE IF NOT EXISTS "fury_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL UNIQUE,
	"target_roas" numeric(10, 2) NOT NULL DEFAULT '4.00',
	"target_cpa" numeric(10, 2) NOT NULL DEFAULT '50.00',
	"target_ctr" numeric(10, 2) NOT NULL DEFAULT '3.00',
	"target_budget_utilization" numeric(5, 2) NOT NULL DEFAULT '80.00',
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fury_config" ADD CONSTRAINT "fury_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fury_config_tenant_id_idx" ON "fury_config" ("tenant_id");
