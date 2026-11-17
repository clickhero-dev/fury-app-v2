-- O seed legado criou a conta demo antes de existir is_demo.
-- O slug sozinho não prova identidade: nunca converter conta comercial/mista.
UPDATE tenants t
SET is_demo = true
WHERE t.slug = 'fashion-demo'
  AND t.is_demo = false
  AND t.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id AND u.role = 'demo')
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id AND u.role IS DISTINCT FROM 'demo');
