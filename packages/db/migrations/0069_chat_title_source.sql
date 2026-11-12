-- Existing conversations are protected, including manually named default titles.
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS title_source text NOT NULL DEFAULT 'manual';
