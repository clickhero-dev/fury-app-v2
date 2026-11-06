-- Modo demo é identidade persistida do tenant; não deriva de parâmetro do cliente.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "tenants_is_demo_idx" ON "tenants" ("is_demo") WHERE "is_demo" = true;

-- Conta operacional usada pelo endpoint público /auth/demo-login. Ela não tem
-- senha e não contém token/integração Meta; o acesso sempre é delimitado pelo tenant.
INSERT INTO "tenants" ("name", "slug", "is_demo")
SELECT 'Fashion Demo', 'fashion-demo', true
WHERE NOT EXISTS (SELECT 1 FROM "tenants" WHERE "slug" = 'fashion-demo');

INSERT INTO "users" ("tenant_id", "name", "email", "role")
SELECT t.id, 'Fashion Demo', 'demo@ady.local', 'owner'
FROM "tenants" t
WHERE t.slug = 'fashion-demo'
  AND t.is_demo = true
  AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u.tenant_id = t.id);

INSERT INTO "subscriptions" ("tenant_id", "plan_id", "status", "is_non_expirable")
SELECT t.id, p.id, 'active', true
FROM "tenants" t
CROSS JOIN LATERAL (
  SELECT id FROM "plans" WHERE "is_active" = true ORDER BY "created_at" ASC LIMIT 1
) p
WHERE t.slug = 'fashion-demo'
  AND t.is_demo = true
  AND NOT EXISTS (SELECT 1 FROM "subscriptions" s WHERE s.tenant_id = t.id);
