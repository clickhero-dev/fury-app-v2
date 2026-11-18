-- Survive message/run compaction like chat_turn_checkpoints; deleting the
-- conversation removes its receipts.
CREATE TABLE IF NOT EXISTS chat_guided_setup_receipts (
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_message_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (conversation_id, user_message_id)
);

CREATE TABLE IF NOT EXISTS chat_guided_setup_snapshots (
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_message_id uuid NOT NULL,
  step text NOT NULL,
  answers jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (conversation_id, user_message_id)
);
