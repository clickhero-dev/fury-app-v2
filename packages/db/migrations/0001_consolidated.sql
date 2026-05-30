CREATE TABLE IF NOT EXISTS "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rule_type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"threshold" numeric NOT NULL,
	"action" text DEFAULT 'pause' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_rules_tenant_id_idx" ON "automation_rules" ("tenant_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
ALTER TABLE "creative_assets" ALTER COLUMN "compliance_status" SET DEFAULT 'pending_compliance';ALTER TABLE "creative_assets"
ADD COLUMN "compliance_notes" text;
DROP TABLE IF EXISTS "automation_rules" CASCADE;
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"trigger" varchar(255) NOT NULL,
	"rule_type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"threshold" numeric NOT NULL,
	"action" text NOT NULL DEFAULT 'pause',
	"enabled" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_rules_tenant_id_idx" ON "automation_rules" ("tenant_id");
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
-- Enums
DO $$ BEGIN
  CREATE TYPE "plan_interval" AS ENUM('monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "subscription_status" AS ENUM('trial', 'active', 'past_due', 'cancelled', 'inactive');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "invoice_status" AS ENUM('pending', 'paid', 'overdue', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Plans
CREATE TABLE IF NOT EXISTS "plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(100) NOT NULL,
  "price_cents" integer NOT NULL,
  "interval" "plan_interval" NOT NULL DEFAULT 'monthly',
  "features" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plan_id" uuid NOT NULL,
  "asaas_subscription_id" varchar(255),
  "asaas_customer_id" varchar(255),
  "status" "subscription_status" NOT NULL DEFAULT 'trial',
  "trial_ends_at" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Invoices
CREATE TABLE IF NOT EXISTS "invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "subscription_id" uuid NOT NULL,
  "asaas_payment_id" varchar(255),
  "amount_cents" integer NOT NULL,
  "status" "invoice_status" NOT NULL DEFAULT 'pending',
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fk"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fk"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "subscriptions_tenant_id_idx" ON "subscriptions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" ("status");
CREATE INDEX IF NOT EXISTS "invoices_tenant_id_idx" ON "invoices" ("tenant_id");
CREATE INDEX IF NOT EXISTS "invoices_subscription_id_idx" ON "invoices" ("subscription_id");
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices" ("status");
-- Drop the incorrectly created table and types
DROP TABLE IF EXISTS "budget_optimizations" CASCADE;
DROP TYPE IF EXISTS "budget_mode";
DROP TYPE IF EXISTS "budget_optimization_status";

-- Create correct enums
CREATE TYPE "budget_mode" AS ENUM ('suggestion', 'auto');
CREATE TYPE "budget_optimization_status" AS ENUM ('pending', 'applied', 'rejected');

-- Create budget_optimizations table with correct schema
CREATE TABLE "budget_optimizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "total_budget" numeric NOT NULL,
  "adjustments" jsonb DEFAULT '[]'::jsonb,
  "mode" "budget_mode" NOT NULL DEFAULT 'suggestion'::budget_mode,
  "status" "budget_optimization_status" NOT NULL DEFAULT 'pending'::budget_optimization_status,
  "applied_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indices
CREATE INDEX "budget_optimizations_tenant_id_idx" on "budget_optimizations"("tenant_id");
CREATE INDEX "budget_optimizations_status_idx" on "budget_optimizations"("status");

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

CREATE INDEX "performance_rules_tenant_id_idx" ON "performance_rules" ("tenant_id");

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

CREATE INDEX "rule_executions_rule_id_idx" ON "rule_executions" ("rule_id");
CREATE INDEX "rule_executions_campaign_id_idx" ON "rule_executions" ("campaign_id");
CREATE INDEX "rule_executions_triggered_at_idx" ON "rule_executions" ("triggered_at");

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
