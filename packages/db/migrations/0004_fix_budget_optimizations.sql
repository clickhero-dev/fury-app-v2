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
