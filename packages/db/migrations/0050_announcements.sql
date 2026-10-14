-- Migration 0050: avisos/novidades exibidos uma vez por usuário

CREATE TABLE IF NOT EXISTS "announcements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(255) NOT NULL,
  "markdown" text NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "show_to_new_users" boolean DEFAULT false NOT NULL,
  "ends_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_active_idx" ON "announcements" USING btree ("is_active", "published_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_views" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "announcement_id" uuid NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE,
  "seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "announcement_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_views_announcement_id_idx" ON "announcement_views" USING btree ("announcement_id");
