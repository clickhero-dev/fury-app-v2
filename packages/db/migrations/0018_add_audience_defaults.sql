ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "audience_defaults" jsonb DEFAULT '{"city":"","ageMin":18,"ageMax":65,"gender":"all"}'::jsonb;
