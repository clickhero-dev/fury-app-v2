-- Migration 0063: funcionalidades bloqueadas por plano

CREATE TABLE IF NOT EXISTS "ady_rbac_plan_views_blocked" (
  "plan_id" uuid NOT NULL REFERENCES "plans"("id") ON DELETE CASCADE,
  "view_key" varchar(100) NOT NULL REFERENCES "ady_rbac_views"("key") ON DELETE CASCADE,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("plan_id", "view_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ady_rbac_plan_views_blocked_view_idx" ON "ady_rbac_plan_views_blocked" USING btree ("view_key");
