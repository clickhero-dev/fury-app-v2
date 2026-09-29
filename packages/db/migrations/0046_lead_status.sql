-- FEAT status de clientes: enum de status + colunas em meta_leads
-- Regra: 1º dia = novo; 2º dia sem alteração = não contatado (cron diário).
CREATE TYPE "lead_status" AS ENUM (
  'novo',
  'não contatado',
  'tentativa de contato',
  'negociando',
  'comprou',
  'não comprou'
);

ALTER TABLE "meta_leads"
  ADD COLUMN IF NOT EXISTS "status" "lead_status" NOT NULL DEFAULT 'novo',
  ADD COLUMN IF NOT EXISTS "status_updated_at" timestamp(3) with time zone;

CREATE INDEX IF NOT EXISTS "meta_leads_status_idx" ON "meta_leads" ("status");
CREATE INDEX IF NOT EXISTS "meta_leads_status_created_idx" ON "meta_leads" ("status", "created_time");