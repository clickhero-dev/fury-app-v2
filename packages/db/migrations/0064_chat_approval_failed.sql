ALTER TABLE chat_approvals DROP CONSTRAINT IF EXISTS chat_approvals_status_check;
ALTER TABLE chat_approvals ADD CONSTRAINT chat_approvals_status_check CHECK (status IN ('pending','approved','executing','completed','cancelled','failed'));
