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
