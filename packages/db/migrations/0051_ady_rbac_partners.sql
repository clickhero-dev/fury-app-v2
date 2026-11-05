-- Migration 0051: RBAC da plataforma e parceiros (plano parceiro)

CREATE TABLE IF NOT EXISTS "ady_rbac_roles" (
  "key" varchar(50) PRIMARY KEY NOT NULL,
  "name" varchar(100) NOT NULL,
  "description" text,
  "is_system" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "ady_rbac_roles" ("key", "name", "description", "is_system") VALUES
  ('super_admin', 'Super admin', 'Usuário master da ady', true),
  ('admin_partner', 'Admin parceiro', 'Conta da empresa parceira que administra os próprios clientes', true),
  ('user_partner', 'Cliente do parceiro', 'Usuário dos clientes de um parceiro', true),
  ('tester', 'Tester', 'Usuário de teste da aplicação', true),
  ('user', 'Usuário', 'Cliente direto da ady', true)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ady_partners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "max_tenants" integer DEFAULT 0 NOT NULL CHECK ("max_tenants" >= 0),
  "status" varchar(20) DEFAULT 'active' NOT NULL CHECK ("status" IN ('active', 'suspended')),
  "openrouter_key_encrypted" text,
  "openrouter_key_last4" varchar(4),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "platform_role" varchar(50) DEFAULT 'user' NOT NULL REFERENCES "ady_rbac_roles"("key");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "partner_id" uuid REFERENCES "ady_partners"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "partner_id" uuid REFERENCES "ady_partners"("id");
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "partner_id" uuid REFERENCES "ady_partners"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_partner_id_idx" ON "users" USING btree ("partner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenants_partner_id_idx" ON "tenants" USING btree ("partner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plans_partner_id_idx" ON "plans" USING btree ("partner_id");
--> statement-breakpoint
-- superadmin atual passa a ser super_admin na plataforma
UPDATE "users" SET "platform_role" = 'super_admin' WHERE "role" = 'superadmin';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ady_rbac_services" (
  "key" varchar(100) PRIMARY KEY NOT NULL,
  "method" varchar(10),
  "route" text,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ady_rbac_views" (
  "key" varchar(100) PRIMARY KEY NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- 'all' representa "bloquear tudo"
INSERT INTO "ady_rbac_services" ("key", "description") VALUES ('all', 'Todos os serviços')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "ady_rbac_views" ("key", "description") VALUES ('all', 'Todas as telas')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ady_rbac_services_blocked" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "role_key" varchar(50) NOT NULL REFERENCES "ady_rbac_roles"("key") ON DELETE CASCADE,
  "partner_id" uuid REFERENCES "ady_partners"("id") ON DELETE CASCADE,
  "service_key" varchar(100) NOT NULL REFERENCES "ady_rbac_services"("key") ON DELETE CASCADE,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- partner_id vazio = vale para todos os parceiros
CREATE UNIQUE INDEX IF NOT EXISTS "ady_rbac_services_blocked_global_uniq" ON "ady_rbac_services_blocked" ("role_key", "service_key") WHERE "partner_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ady_rbac_services_blocked_partner_uniq" ON "ady_rbac_services_blocked" ("role_key", "partner_id", "service_key") WHERE "partner_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ady_rbac_views_blocked" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "role_key" varchar(50) NOT NULL REFERENCES "ady_rbac_roles"("key") ON DELETE CASCADE,
  "partner_id" uuid REFERENCES "ady_partners"("id") ON DELETE CASCADE,
  "view_key" varchar(100) NOT NULL REFERENCES "ady_rbac_views"("key") ON DELETE CASCADE,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ady_rbac_views_blocked_global_uniq" ON "ady_rbac_views_blocked" ("role_key", "view_key") WHERE "partner_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ady_rbac_views_blocked_partner_uniq" ON "ady_rbac_views_blocked" ("role_key", "partner_id", "view_key") WHERE "partner_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ady_rbac_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" varchar(50) NOT NULL,
  "entity_type" varchar(50) NOT NULL,
  "entity_key" text,
  "role_key" varchar(50),
  "partner_id" uuid,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ady_rbac_audit_log_created_at_idx" ON "ady_rbac_audit_log" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ady_rbac_audit_log_partner_id_idx" ON "ady_rbac_audit_log" USING btree ("partner_id");
