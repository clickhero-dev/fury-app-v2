-- Business aggregate only. Queue history/attempt logs remain in BullMQ (ADR-0004).
CREATE TABLE IF NOT EXISTS chat_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  goal text NOT NULL CHECK (length(goal) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','waiting_approval','completed','failed','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  tasks jsonb NOT NULL CHECK (jsonb_typeof(tasks)='array' AND jsonb_array_length(tasks) BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_plans_owner_idx ON chat_plans(tenant_id,user_id,conversation_id,created_at,id);
CREATE INDEX IF NOT EXISTS chat_plans_recovery_idx ON chat_plans(updated_at,id) WHERE status IN ('running','waiting_approval','paused','cancelled');
