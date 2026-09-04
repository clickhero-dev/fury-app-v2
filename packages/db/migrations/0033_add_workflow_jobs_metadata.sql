-- Migration 0033: workflow_jobs.metadata
-- Metadados arbitrários do job (ex.: postsCount do planejador). Necessário para
-- o recovery preservar a quantidade de posts pedida pelo usuário sem reexecutar a LLM.

ALTER TABLE "workflow_jobs" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;