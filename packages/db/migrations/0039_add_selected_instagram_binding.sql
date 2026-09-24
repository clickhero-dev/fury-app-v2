-- 0039_add_selected_instagram_binding.sql
-- Vinculação explícita do Instagram do calendário: id + @username do
-- Instagram Business resolvidos SERVER-SIDE no save-selection (owned_pages).
-- O publish-due só publica neste perfil (enforcement em
-- PlannerService.resolveInstagramAccount) — corrige publicação em conta
-- errada (velora_studio → jeanvdentz, 2026-09). Idempotente (re-run seguro).
-- (renumber de 0038: colisão com 0038_creative_asset_versioning_archive no hmg)
ALTER TABLE meta_connections
  ADD COLUMN IF NOT EXISTS selected_instagram_user_id varchar(255);

ALTER TABLE meta_connections
  ADD COLUMN IF NOT EXISTS selected_instagram_username varchar(255);
