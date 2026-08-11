-- Migração: colunas de retry de publicação (FR8)
-- Aplicar no banco de homologação (HMG)
-- 2026-08-11

-- 1. Adicionar valor 'failed' ao enum post_status
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'failed';

-- 2. Adicionar colunas de retry no social_posts
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS publish_attempts INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS last_publish_error TEXT,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
