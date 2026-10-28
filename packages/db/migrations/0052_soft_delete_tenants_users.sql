-- Migration 0052: soft-delete de clientes (tenants) e usuários

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
