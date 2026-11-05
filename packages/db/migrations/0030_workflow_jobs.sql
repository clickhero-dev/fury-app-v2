-- Migration 0030: Workflow jobs (state machine checkpoints)
-- Estado + checkpoints auditáveis para workflows tolerantes a falhas.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_status') THEN
    CREATE TYPE "workflow_status" AS ENUM ('pending', 'running', 'done', 'error');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "workflow_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workflow" varchar(100) NOT NULL,
  "status" "workflow_status" NOT NULL DEFAULT 'pending',
  "lock_key" varchar(255) NOT NULL,
  "current_stage" varchar(100),
  "stages" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "artifacts" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" text,
  "plan_id" uuid REFERENCES "campaign_plans"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "workflow_jobs_tenant_id_idx" ON "workflow_jobs" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "workflow_jobs_workflow_idx" ON "workflow_jobs" ("workflow");
CREATE INDEX IF NOT EXISTS "workflow_jobs_lock_key_idx" ON "workflow_jobs" ("lock_key");
CREATE INDEX IF NOT EXISTS "workflow_jobs_status_idx" ON "workflow_jobs" ("status");