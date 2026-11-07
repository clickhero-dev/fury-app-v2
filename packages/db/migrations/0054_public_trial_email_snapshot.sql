ALTER TABLE "public_trial_accounts"
  ADD COLUMN IF NOT EXISTS "signup_email" varchar(255);

-- Legacy rows remain NULL: their original signup email cannot be reconstructed safely.

CREATE UNIQUE INDEX IF NOT EXISTS "public_trial_accounts_signup_email_unique"
  ON "public_trial_accounts" ("signup_email")
  WHERE "signup_email" IS NOT NULL;
