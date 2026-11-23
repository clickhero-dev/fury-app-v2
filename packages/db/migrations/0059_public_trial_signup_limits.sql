-- Corrige instalações que receberam a versão inicial de sete imagens.
-- A cota efetiva fica em subscriptions.creatives_remaining e é descontada
-- atomicamente pelo SubscriptionRepository.
UPDATE "plans"
SET "limits" = jsonb_set(COALESCE("limits", '{}'::jsonb), '{creativesPerMonth}', '5'::jsonb, true)
WHERE "technical_key" = 'public_trial_signup';

UPDATE "subscriptions" s
SET "creatives_remaining" = LEAST(COALESCE(s."creatives_remaining", 5), 5)
FROM "plans" p
WHERE s."plan_id" = p."id"
  AND p."technical_key" = 'public_trial_signup';
