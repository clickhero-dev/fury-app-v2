-- Default plan automatically assigned to every account created after this migration.
-- Keep the limits aligned with SubscriptionRepository and StudioVideoService.
UPDATE "plans"
SET "name" = 'Trial',
    "price_cents" = 0,
    "interval" = 'monthly',
    "features" = '{"trialDays":7,"images":5,"revisionsPerImage":3,"videos":false}'::jsonb,
    "limits" = '{"creativesPerMonth":5,"modificationsPerCreative":3,"videosPerMonth":0}'::jsonb,
    "is_active" = true
WHERE lower("name") = 'trial';

INSERT INTO "plans" ("name", "price_cents", "interval", "features", "limits", "is_active")
SELECT
  'Trial',
  0,
  'monthly',
  '{"trialDays":7,"images":5,"revisionsPerImage":3,"videos":false}'::jsonb,
  '{"creativesPerMonth":5,"modificationsPerCreative":3,"videosPerMonth":0}'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "plans" WHERE lower("name") = 'trial'
);
