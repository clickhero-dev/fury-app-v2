ALTER TABLE chat_guided_setup_snapshots ADD COLUMN IF NOT EXISTS profile_user_version text;
ALTER TABLE chat_guided_setup_snapshots ADD COLUMN IF NOT EXISTS profile_tenant_version text;

CREATE TABLE IF NOT EXISTS chat_guided_profile_effects (
  conversation_id uuid NOT NULL,
  user_message_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (conversation_id, user_message_id),
  FOREIGN KEY (conversation_id, user_message_id)
    REFERENCES chat_guided_setup_receipts(conversation_id, user_message_id) ON DELETE CASCADE
);
