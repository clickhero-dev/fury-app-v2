-- Migration 0032: budget_optimizations
-- Tabela existia apenas em snapshots drizzle (0001_consolidated antigo / 0007_young_psynapse
-- não está no STEPS) — bancos migrados em sequência nunca a receberam.
-- Idempotente: DO blocks para enums, IF NOT EXISTS para tabela/índices.

DO $$ BEGIN
  CREATE TYPE "budget_mode" AS ENUM ('suggestion', 'auto');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "budget_optimization_status" AS ENUM ('pending', 'applied', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "budget_optimizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "total_budget" numeric NOT NULL,
  "adjustments" jsonb DEFAULT '[]'::jsonb,
  "mode" "budget_mode" DEFAULT 'suggestion' NOT NULL,
  "status" "budget_optimization_status" DEFAULT 'pending' NOT NULL,
  "applied_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "budget_optimizations_tenant_id_idx" ON "budget_optimizations" ("tenant_id");
CREATE INDEX IF NOT EXISTS "budget_optimizations_status_idx" ON "budget_optimizations" ("status");