ALTER TABLE chat_guided_setups ADD COLUMN IF NOT EXISTS profile_user_version text;
ALTER TABLE chat_guided_setups ADD COLUMN IF NOT EXISTS profile_tenant_version text;
