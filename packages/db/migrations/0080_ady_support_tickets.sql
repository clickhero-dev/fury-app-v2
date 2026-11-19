-- Migration 0080: cópia local dos chamados [N1]–[N5] do ClickUp (lista + última atualização)

CREATE TABLE IF NOT EXISTS "ady_support_tickets" (
  "clickup_id" varchar(64) PRIMARY KEY NOT NULL,
  "name" varchar(1000) NOT NULL,
  "status" varchar(100) NOT NULL,
  "status_type" varchar(30) NOT NULL,
  "priority" varchar(20),
  "url" text NOT NULL,
  "labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "assignees" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ticket_created_at" timestamp with time zone NOT NULL,
  "done_at" timestamp with time zone,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ady_support_tickets_created_idx" ON "ady_support_tickets" USING btree ("ticket_created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ady_support_tickets_sync" (
  "id" smallint PRIMARY KEY DEFAULT 1 NOT NULL CHECK ("id" = 1),
  "synced_at" timestamp with time zone NOT NULL
);
