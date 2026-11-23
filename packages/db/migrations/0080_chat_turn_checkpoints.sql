-- Message/run rows can disappear during compaction. Their UUID here is a causal
-- identity, deliberately NOT a foreign key; ownership/lifetime follow conversation.
CREATE TABLE IF NOT EXISTS chat_turn_checkpoints (
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_message_id uuid NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  policy_version text NOT NULL CHECK (length(policy_version) BETWEEN 1 AND 128),
  context jsonb NOT NULL CHECK (jsonb_typeof(context) = 'array'),
  history jsonb NOT NULL CHECK (jsonb_typeof(history) = 'array'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (conversation_id, user_message_id),
  CHECK (octet_length(context::text) + octet_length(history::text) <= 2097152)
);

CREATE TABLE IF NOT EXISTS chat_tool_checkpoints (
  conversation_id uuid NOT NULL,
  user_message_id uuid NOT NULL,
  tool_name text NOT NULL CHECK (tool_name IN (
    'brand','profile','calendar','campaigns','assets','brand_photos',
    'campaign_ads','ad_details','ad_assets','available_ad_assets'
  )),
  args_hash text NOT NULL CHECK (args_hash ~ '^[a-f0-9]{64}$'),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  policy_version text NOT NULL CHECK (length(policy_version) BETWEEN 1 AND 128),
  result jsonb NOT NULL CHECK (octet_length(result::text) <= 262144),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (conversation_id, user_message_id, tool_name, args_hash),
  FOREIGN KEY (conversation_id, user_message_id)
    REFERENCES chat_turn_checkpoints(conversation_id, user_message_id) ON DELETE CASCADE
);
