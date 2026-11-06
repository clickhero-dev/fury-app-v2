UPDATE "plans"
SET "limits" = jsonb_set(COALESCE("limits", '{}'::jsonb), '{creativesPerMonth}', '7'::jsonb),
    "is_active" = true
WHERE "technical_key" = 'trial_new_signup';

UPDATE "plans" SET "is_active" = false WHERE "technical_key" = 'public_trial_signup';
