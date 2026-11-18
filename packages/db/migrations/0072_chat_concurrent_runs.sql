-- Concurrent turns have independent leases and retain their response association.
DROP INDEX IF EXISTS chat_response_runs_active;
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='chat_response_runs'::regclass
               AND attname='assistant_message_id' AND NOT attisdropped) THEN
ALTER TABLE chat_response_runs ADD COLUMN assistant_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL;

-- Only reconstruct an unambiguous sequential legacy turn. Equal timestamps,
-- multiple replies, competing completions, and interleaved users cannot prove causality.
WITH candidates AS (
  SELECT r.id AS run_id, min(a.id::text)::uuid AS assistant_id
  FROM chat_response_runs r
  JOIN chat_messages u ON u.id=r.user_message_id AND u.conversation_id=r.conversation_id AND u.role='user'
  JOIN chat_messages a ON a.conversation_id=r.conversation_id AND a.role='assistant'
    AND a.created_at > u.created_at
    AND NOT EXISTS (SELECT 1 FROM chat_messages next_user
      WHERE next_user.conversation_id=u.conversation_id AND next_user.role='user'
        AND next_user.created_at > u.created_at AND next_user.created_at <= a.created_at)
  WHERE r.status='completed' AND r.assistant_message_id IS NULL
    -- Failed/interrupted attempts are safe only when they ended strictly before
    -- this completed retry began; any competing or overlapping run is ambiguous.
    AND NOT EXISTS (SELECT 1 FROM chat_response_runs other
      WHERE other.user_message_id=u.id AND other.id<>r.id
        AND (other.conversation_id<>r.conversation_id
          OR other.status NOT IN ('failed','interrupted')
          OR other.updated_at >= r.created_at))
    AND NOT EXISTS (SELECT 1 FROM chat_messages tied WHERE tied.conversation_id=u.conversation_id
      AND tied.id<>u.id AND tied.created_at=u.created_at)
  GROUP BY r.id
  -- Legacy complete() inserted the reply and updated the run using now() in
  -- the same transaction, so both timestamps must be identical.
  HAVING count(*)=1 AND bool_and(a.created_at=r.updated_at)
)
UPDATE chat_response_runs r SET assistant_message_id=c.assistant_id
FROM candidates c WHERE r.id=c.run_id AND r.assistant_message_id IS NULL;
END IF;
END $$;
CREATE INDEX IF NOT EXISTS chat_response_runs_running ON chat_response_runs(conversation_id) WHERE status='running';
CREATE UNIQUE INDEX IF NOT EXISTS chat_response_runs_message_running ON chat_response_runs(user_message_id) WHERE status='running';

-- One client operation can create at most one run in an owned conversation.
ALTER TABLE chat_response_runs ADD COLUMN IF NOT EXISTS client_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS chat_response_runs_client_key ON chat_response_runs(conversation_id,client_key) WHERE client_key IS NOT NULL;

-- Tombstones survive message compaction; conversation deletion removes them.
CREATE TABLE IF NOT EXISTS chat_send_keys (
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  client_key uuid NOT NULL,
  PRIMARY KEY (conversation_id, client_key)
);
INSERT INTO chat_send_keys(conversation_id,client_key)
SELECT conversation_id,client_key FROM chat_response_runs WHERE client_key IS NOT NULL
ON CONFLICT DO NOTHING;
