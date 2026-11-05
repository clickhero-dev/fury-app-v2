-- Migração: adiciona valores faltantes ao enum post_status
-- O schema TS (schema.ts) define: draft, approved, rejected, published, confirmed, failed
-- Mas a migração 0023_planner_tables criou: draft, approved, scheduled, published
-- E o afterHook 0011 adicionou: failed
-- Faltam: rejected, confirmed

ALTER TYPE "post_status" ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE "post_status" ADD VALUE IF NOT EXISTS 'confirmed';
