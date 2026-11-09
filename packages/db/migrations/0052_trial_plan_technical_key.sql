ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "technical_key" varchar(100);
CREATE UNIQUE INDEX IF NOT EXISTS "plans_technical_key_unique"
  ON "plans" ("technical_key")
  WHERE "technical_key" IS NOT NULL;

INSERT INTO "plans" ("name", "technical_key", "price_cents", "interval", "features", "limits", "is_active")
VALUES (
  'Trial 7 dias',
  'trial_new_signup',
  0,
  'monthly',
  '{"studio":true,"downloads":true,"metaPublishing":false}',
  '{"creativesPerMonth":5}',
  true
)
ON CONFLICT ("technical_key") WHERE "technical_key" IS NOT NULL DO UPDATE
SET
  "price_cents" = EXCLUDED."price_cents",
  "limits" = EXCLUDED."limits",
  "is_active" = EXCLUDED."is_active";
