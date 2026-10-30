-- Migration 0053: notificações in-app por usuário
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "recipient_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "type" varchar(32) DEFAULT 'general' NOT NULL,
  "title" varchar(120) NOT NULL,
  "body" varchar(500) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "read_at" timestamptz,
  "idempotency_key" varchar(128),
  "payload_hash" varchar(64)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_created_idx" ON "notifications" ("tenant_id", "recipient_user_id", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_unread_idx" ON "notifications" ("tenant_id", "recipient_user_id", "read_at", "created_at" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_idempotency_unique" ON "notifications" ("tenant_id", "created_by_user_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
