ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notification_prefs" jsonb DEFAULT '{"campanhas":true,"performance":true,"equipe":false}'::jsonb;
