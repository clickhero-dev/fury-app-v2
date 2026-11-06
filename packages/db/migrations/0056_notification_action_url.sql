-- Migration 0056: link de ação para notificações in-app
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "action_url" varchar(255);
