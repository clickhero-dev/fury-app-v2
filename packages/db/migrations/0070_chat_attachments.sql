-- Private chat media. Files are removed before metadata/conversation deletion.
-- RESTRICT intentionally prevents a conversation/message cascade from orphaning private objects.
CREATE TABLE IF NOT EXISTS chat_attachments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE RESTRICT,
  message_id uuid NULL REFERENCES chat_messages(id) ON DELETE RESTRICT,
  filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  storage_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS chat_attachments_owner_idx ON chat_attachments(tenant_id,user_id,conversation_id);
CREATE INDEX IF NOT EXISTS chat_attachments_message_idx ON chat_attachments(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_attachments_expiry_idx ON chat_attachments(created_at) WHERE message_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_attachments_draft_digest_idx
  ON chat_attachments(tenant_id,user_id,conversation_id,(metadata->>'sha256'),filename) WHERE message_id IS NULL;
