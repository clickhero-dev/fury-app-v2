-- Garante o catálogo mínimo exigido pelo cadastro manual. A chave técnica é
-- imutável para este contrato: uma configuração existente é administrada
-- operacionalmente e não deve ser sobrescrita durante uma migration.
INSERT INTO "plans" ("name", "technical_key", "price_cents", "interval", "features", "limits", "is_active")
VALUES (
  'Trial 7 dias',
  'trial_new_signup',
  0,
  'monthly',
  '{"studio":true,"downloads":true,"metaPublishing":false}'::jsonb,
  '{"creativesPerMonth":5}'::jsonb,
  true
)
ON CONFLICT ("technical_key") WHERE "technical_key" IS NOT NULL DO NOTHING;
