-- Migration 0078: equipe da conta do parceiro segue o parceiro; telas essenciais saem das permissões

-- usuários comuns dentro da conta própria do parceiro passam a ser do parceiro
UPDATE "users" AS u
SET "platform_role" = 'user_partner', "partner_id" = acc."partner_id"
FROM (
  SELECT DISTINCT ON (a."tenant_id") a."tenant_id", a."partner_id"
  FROM "users" a
  JOIN "ady_partners" p ON p."id" = a."partner_id"
  JOIN "tenants" t ON t."id" = a."tenant_id" AND t."partner_id" IS NULL
  WHERE a."platform_role" = 'admin_partner' AND a."deleted_at" IS NULL
  ORDER BY a."tenant_id", a."created_at"
) AS acc
WHERE u."tenant_id" = acc."tenant_id" AND u."platform_role" = 'user';
--> statement-breakpoint
-- Dashboard, Configurações, Planos e Assinatura não são mais bloqueáveis
DELETE FROM "ady_rbac_views_blocked" WHERE "view_key" IN ('dashboard', 'settings', 'settings.integrations', 'plans', 'subscription');
--> statement-breakpoint
DELETE FROM "ady_rbac_services_blocked" WHERE "service_key" = 'dashboard';
--> statement-breakpoint
DELETE FROM "ady_partner_plan_views_blocked" WHERE "view_key" IN ('dashboard', 'settings', 'settings.integrations', 'plans', 'subscription');
