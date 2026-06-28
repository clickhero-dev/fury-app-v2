ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_otp_hash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_otp_expires_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_token_hash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_expires_at" timestamp with time zone;

-- Usuários já existentes são considerados verificados
UPDATE "users"
SET "email_verified" = true,
    "email_verified_at" = COALESCE("email_verified_at", NOW())
WHERE "email_verified" = false
  AND "email_otp_hash" IS NULL;
