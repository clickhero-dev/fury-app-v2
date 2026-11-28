-- Migration 0079: Automações deixa de ser bloqueável (segue o que já está liberado)

DELETE FROM "ady_rbac_views_blocked" WHERE "view_key" = 'automation';
--> statement-breakpoint
DELETE FROM "ady_rbac_services_blocked" WHERE "service_key" = 'automation';
--> statement-breakpoint
DELETE FROM "ady_partner_plan_views_blocked" WHERE "view_key" = 'automation';
