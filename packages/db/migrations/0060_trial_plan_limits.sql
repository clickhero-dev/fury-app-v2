UPDATE "plans"
SET "limits" = COALESCE("limits", '{}'::jsonb) ||
      '{"creativesPerMonth":5,"modificationsPerCreative":3,"videosPerMonth":0,"modificationsPerVideo":0}'::jsonb,
    "is_active" = true
WHERE "technical_key" = 'trial_new_signup';

UPDATE "plans"
SET "limits" = COALESCE("limits", '{}'::jsonb) ||
      '{"creativesPerMonth":5,"modificationsPerCreative":3,"videosPerMonth":0,"modificationsPerVideo":0,"source":"public_trial"}'::jsonb,
    "is_active" = false
WHERE "technical_key" = 'public_trial_signup';
