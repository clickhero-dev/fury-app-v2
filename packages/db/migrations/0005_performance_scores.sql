DO $$ BEGIN
  CREATE TYPE "performance_grade" AS ENUM ('A', 'B', 'C', 'D', 'F');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "performance_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "score" integer NOT NULL,
  "grade" "performance_grade" NOT NULL,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metrics_snapshot" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "performance_scores" ADD CONSTRAINT "performance_scores_campaign_id_campaigns_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "performance_scores" ADD CONSTRAINT "performance_scores_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_scores_campaign_id_idx" ON "performance_scores" ("campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_scores_tenant_id_idx" ON "performance_scores" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_scores_computed_at_idx" ON "performance_scores" ("computed_at");
