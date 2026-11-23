CREATE TABLE IF NOT EXISTS "public_trial_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "phone" varchar(20),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "public_trial_accounts_user_idx" ON "public_trial_accounts" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_unique" ON "users" (lower("email"));

CREATE TABLE IF NOT EXISTS "public_trial_magic_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "public_trial_accounts"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "public_trial_magic_links_account_idx" ON "public_trial_magic_links" ("account_id");

INSERT INTO "plans" ("name", "technical_key", "price_cents", "interval", "features", "limits", "is_active")
SELECT 'Trial formulário público', 'public_trial_signup', 0, 'monthly', '{}'::jsonb,
       '{"creativesPerMonth":5,"source":"public_trial"}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "technical_key" = 'public_trial_signup');
