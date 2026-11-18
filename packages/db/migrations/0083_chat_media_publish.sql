-- Uma intenção de publicação por mídia gerada, sem renovação automática do claim.
CREATE TABLE IF NOT EXISTS chat_media_publications (
  approval_id uuid PRIMARY KEY REFERENCES chat_approvals(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
