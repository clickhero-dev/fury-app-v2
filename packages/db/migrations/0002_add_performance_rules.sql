-- Performance Rules table
CREATE TABLE IF NOT EXISTS "performance_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"condition_field" text NOT NULL,
	"condition_operator" text NOT NULL,
	"condition_value" numeric NOT NULL,
	"action" text NOT NULL,
	"action_value" numeric,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "performance_rules_tenant_id_idx" ON "performance_rules" ("tenant_id");

DO $$ BEGIN
 ALTER TABLE "performance_rules" ADD CONSTRAINT "performance_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Rule Executions table
CREATE TABLE IF NOT EXISTS "rule_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action_taken" varchar(255) NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "rule_executions_rule_id_idx" ON "rule_executions" ("rule_id");
CREATE INDEX IF NOT EXISTS "rule_executions_campaign_id_idx" ON "rule_executions" ("campaign_id");
CREATE INDEX IF NOT EXISTS "rule_executions_triggered_at_idx" ON "rule_executions" ("triggered_at");

DO $$ BEGIN
 ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "performance_rules"("id") ON DELETE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
