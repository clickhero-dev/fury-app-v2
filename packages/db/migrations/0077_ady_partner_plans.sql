-- Migration 0077: planos de parceiro (pacote de pagamento único: vagas + telas)

CREATE TABLE IF NOT EXISTS "ady_partner_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "price_cents" integer NOT NULL CHECK ("price_cents" >= 0),
  "max_tenants" integer NOT NULL CHECK ("max_tenants" >= 0),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ady_partner_plans_name_uniq" ON "ady_partner_plans" USING btree (lower("name"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ady_partner_plan_views_blocked" (
  "partner_plan_id" uuid NOT NULL REFERENCES "ady_partner_plans"("id") ON DELETE CASCADE,
  "view_key" varchar(100) NOT NULL REFERENCES "ady_rbac_views"("key") ON DELETE CASCADE,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("partner_plan_id", "view_key")
);
--> statement-breakpoint
ALTER TABLE "ady_partners" ADD COLUMN IF NOT EXISTS "partner_plan_id" uuid REFERENCES "ady_partner_plans"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ady_partners_partner_plan_idx" ON "ady_partners" USING btree ("partner_plan_id");
