-- Durable reconciliation source; never contains delegation credentials or prompts.
CREATE TABLE IF NOT EXISTS chat_turn_recovery (
  user_message_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','queued','completed','stopped','cancelled','exhausted')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 3),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '10 minutes',
  provider_requests integer NOT NULL DEFAULT 0 CHECK (provider_requests >= 0),
  max_provider_requests integer NOT NULL DEFAULT 18 CHECK (max_provider_requests BETWEEN 1 AND 30),
  reserved_tokens integer NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
  max_reserved_tokens integer NOT NULL DEFAULT 180000 CHECK (max_reserved_tokens BETWEEN 1 AND 500000),
  policy_version text NOT NULL DEFAULT 'proactive-v1' CHECK (policy_version='proactive-v1'),
  CHECK (attempts <= max_attempts),
  CHECK (provider_requests <= max_provider_requests),
  CHECK (reserved_tokens <= max_reserved_tokens)
);
CREATE INDEX IF NOT EXISTS chat_turn_recovery_pending_idx
  ON chat_turn_recovery(next_attempt_at, user_message_id) WHERE status IN ('queued','running');
