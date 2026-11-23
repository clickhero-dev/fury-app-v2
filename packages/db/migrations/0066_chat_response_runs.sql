CREATE TABLE IF NOT EXISTS chat_response_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('running','completed','failed','interrupted')),
  lease_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_response_runs_active ON chat_response_runs(conversation_id) WHERE status='running';
CREATE INDEX IF NOT EXISTS chat_response_runs_latest ON chat_response_runs(conversation_id,created_at DESC);
