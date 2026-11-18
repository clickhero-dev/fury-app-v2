CREATE TABLE IF NOT EXISTS chat_guided_setups (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('invitation','declined','business_name','logo','logo_creation','offering','company_photos','team_photos','product_photos','done')),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS chat_guided_setups_user_idx ON chat_guided_setups(user_id, updated_at DESC);
