CREATE TABLE IF NOT EXISTS chat_memories (
  conversation_id uuid PRIMARY KEY REFERENCES chat_conversations(id) ON DELETE CASCADE,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
