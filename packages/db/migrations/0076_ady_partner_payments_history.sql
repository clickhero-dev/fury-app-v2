-- Migration 0076: pagamentos do parceiro viram histórico (plano + adicionais)

DROP INDEX IF EXISTS "ady_partner_payments_partner_uniq";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ady_partner_payments_partner_paid_idx" ON "ady_partner_payments" USING btree ("partner_id", "paid_at" DESC);
--> statement-breakpoint
ALTER TABLE "ady_partner_payments" ADD COLUMN IF NOT EXISTS "kind" varchar(20) DEFAULT 'plan' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ady_partner_payments" ADD CONSTRAINT "ady_partner_payments_kind_check" CHECK ("kind" IN ('plan', 'additional'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
