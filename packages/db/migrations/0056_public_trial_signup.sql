ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "public_trial" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" varchar(20);
-- Fails safely on legacy case-insensitive collisions; never picks an account
-- arbitrarily and prevents concurrent public signups from duplicating identity.
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_normalized_unique" ON "users" (lower("email"));

CREATE TABLE IF NOT EXISTS "public_trial_access_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "public_trial_access_tokens_user_idx" ON "public_trial_access_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "public_trial_access_tokens_expires_idx" ON "public_trial_access_tokens" ("expires_at");

INSERT INTO "plans" ("name", "technical_key", "price_cents", "interval", "features", "limits", "is_active")
SELECT 'Trial público', 'public_trial_signup', 0, 'monthly', '{"publicTrial":true}'::jsonb, '{"creativesPerMonth":7}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "technical_key" = 'public_trial_signup');
