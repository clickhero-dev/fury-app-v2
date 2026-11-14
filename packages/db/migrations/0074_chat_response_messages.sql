-- Explicit ordered messages per response, including unambiguous legacy links.
CREATE TABLE IF NOT EXISTS chat_response_messages (
  run_id uuid NOT NULL REFERENCES chat_response_runs(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 4),
  message_id uuid NOT NULL UNIQUE REFERENCES chat_messages(id) ON DELETE CASCADE,
  PRIMARY KEY (run_id, position)
);
INSERT INTO chat_response_messages(run_id, position, message_id)
SELECT id, 0, assistant_message_id FROM chat_response_runs
WHERE status='completed' AND assistant_message_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS chat_clarifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL UNIQUE REFERENCES chat_response_runs(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  question text NOT NULL,
  choices jsonb NOT NULL CHECK (jsonb_typeof(choices)='array' AND jsonb_array_length(choices) BETWEEN 2 AND 5),
  selected_index integer CHECK (selected_index BETWEEN 0 AND 4),
  answer_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
