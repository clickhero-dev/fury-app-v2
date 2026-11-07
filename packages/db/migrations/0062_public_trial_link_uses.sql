ALTER TABLE "public_trial_magic_links" ADD COLUMN IF NOT EXISTS "use_count" integer NOT NULL DEFAULT 0;
UPDATE "public_trial_magic_links" SET "use_count" = 3 WHERE "consumed_at" IS NOT NULL AND "use_count" = 0;
