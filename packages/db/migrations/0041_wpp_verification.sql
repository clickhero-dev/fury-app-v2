-- Migration 0041: Integração WhatsApp (uazapi) — verificação de número + inbox de webhooks (issue #207)

CREATE TYPE "wpp_verification_status" AS ENUM ('pending', 'verified', 'failed', 'expired');
--> statement-breakpoint
-- Verificação de número WhatsApp do tenant (Brand kit → Conversas WhatsApp).
-- O código é armazenado apenas como hash (sha256); nunca em texto puro.
CREATE TABLE IF NOT EXISTS "wpp_verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "phone" varchar(40) NOT NULL,
  "status" wpp_verification_status NOT NULL DEFAULT 'pending',
  "code_hash" varchar(128) NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "sent_count" integer NOT NULL DEFAULT 1,
  "last_sent_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "verified_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wpp_verifications_tenant_id_idx" ON "wpp_verifications" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wpp_verifications_phone_status_idx" ON "wpp_verifications" ("phone", "status");
--> statement-breakpoint
-- RLS no padrão do projeto (enable_rls.sql): tenant isolation via app.current_tenant_id
ALTER TABLE "wpp_verifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY wpp_verifications_tenant_isolation ON wpp_verifications
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint
-- Inbox durável de eventos do webhook uazapi (global, sem tenant — o evento chega
-- antes de qualquer sessão; roteamento tenant acontece no processamento).
CREATE TABLE IF NOT EXISTS "wpp_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_type" varchar(64),
  "instance_name" varchar(255),
  "owner" varchar(32),
  "payload" jsonb NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'received',
  "received_at" timestamptz DEFAULT now() NOT NULL,
  "processed_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wpp_webhook_events_received_at_idx" ON "wpp_webhook_events" ("received_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wpp_webhook_events_event_type_idx" ON "wpp_webhook_events" ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wpp_webhook_events_status_idx" ON "wpp_webhook_events" ("status");
