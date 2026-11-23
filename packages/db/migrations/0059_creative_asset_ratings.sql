CREATE TABLE IF NOT EXISTS creative_asset_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creative_asset_id uuid NOT NULL REFERENCES creative_assets(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creative_asset_ratings_tenant_user_asset_unique UNIQUE (tenant_id, user_id, creative_asset_id)
);
CREATE INDEX IF NOT EXISTS creative_asset_ratings_tenant_asset_idx ON creative_asset_ratings (tenant_id, creative_asset_id);
