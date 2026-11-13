ALTER TABLE chat_approvals ADD COLUMN IF NOT EXISTS execution_started_at timestamptz;
ALTER TABLE chat_approvals DROP CONSTRAINT IF EXISTS chat_approvals_status_check;
ALTER TABLE chat_approvals ADD CONSTRAINT chat_approvals_status_check CHECK (status IN ('pending','approved','executing','completed','cancelled','failed','unknown'));
UPDATE chat_approvals SET execution_started_at=created_at WHERE status='executing' AND execution_started_at IS NULL;
