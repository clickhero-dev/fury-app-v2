-- Migration 0075: pagamento (único) de cada parceiro à ady

CREATE TABLE IF NOT EXISTS "ady_partner_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL REFERENCES "ady_partners"("id") ON DELETE CASCADE,
  "amount_cents" integer NOT NULL CHECK ("amount_cents" > 0),
  "paid_at" date NOT NULL,
  "note" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ady_partner_payments_partner_uniq" ON "ady_partner_payments" USING btree ("partner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ady_partner_payments_paid_at_idx" ON "ady_partner_payments" USING btree ("paid_at");
