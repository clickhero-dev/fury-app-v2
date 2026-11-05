ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "is_non_expirable" boolean NOT NULL DEFAULT false;
