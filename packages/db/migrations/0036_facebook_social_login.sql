-- Migration 0036: Facebook social login support
-- Adiciona facebook_id em users (nullable), índice de busca e unicidade parcial.

ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS users_facebook_id_idx ON users (facebook_id);

-- Dois usuários não podem compartilhar o mesmo facebook_id.
-- Parcial: linhas com facebook_id NULL não colidem entre si.
CREATE UNIQUE INDEX IF NOT EXISTS users_facebook_id_unique
  ON users (facebook_id)
  WHERE facebook_id IS NOT NULL;
