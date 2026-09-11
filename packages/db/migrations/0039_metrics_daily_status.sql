-- Migration 0039: status da campanha no rollup (feature 014 — fix QA PR #172)
-- Snapshot do status live da lista Meta, gravado a cada ciclo de sync.
-- Usos: fallback de status na listagem (/metrics/campaigns) quando a lista
-- live falha + exclusão de ARCHIVED/DELETED do summary do dashboard
-- (paridade com o live, que filtrava ACTIVE/PAUSED).
-- Backfill on-demand não traz lista → grava NULL; upsert usa coalesce para
-- não apagar o snapshot anterior nesses casos.

ALTER TABLE "metrics_daily" ADD COLUMN IF NOT EXISTS "status" varchar(32);
