DO $$ BEGIN
  CREATE TYPE "google_verification_state" AS ENUM ('UNVERIFIED', 'VERIFIED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "google_sync_status" AS ENUM ('not_connected', 'connected', 'no_profile', 'awaiting_verification', 'verified', 'syncing', 'synced', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "google_sync_operation" AS ENUM ('oauth_connect', 'lookup', 'create', 'update', 'verify', 'sync', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "google_sync_log_status" AS ENUM ('pending', 'in_progress', 'success', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS google_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  google_user_id VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  account_id VARCHAR(255),
  account_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_connections_tenant_id_idx ON google_connections(tenant_id);
CREATE INDEX IF NOT EXISTS google_connections_google_user_id_idx ON google_connections(google_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS google_connections_tenant_id_unique ON google_connections(tenant_id);

CREATE TABLE IF NOT EXISTS google_business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
  gbp_location_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  address JSONB NOT NULL,
  phone VARCHAR(40),
  email VARCHAR(255),
  website VARCHAR(2048),
  category_id VARCHAR(255),
  category_display_name VARCHAR(255),
  hours JSONB,
  photos JSONB DEFAULT '[]'::jsonb,
  verification_state google_verification_state NOT NULL DEFAULT 'UNVERIFIED',
  sync_status google_sync_status NOT NULL DEFAULT 'no_profile',
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_business_profiles_tenant_id_idx ON google_business_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS google_business_profiles_gbp_location_id_idx ON google_business_profiles(gbp_location_id);
CREATE INDEX IF NOT EXISTS google_business_profiles_sync_status_idx ON google_business_profiles(sync_status);
CREATE UNIQUE INDEX IF NOT EXISTS google_business_profiles_tenant_id_unique ON google_business_profiles(tenant_id);

CREATE TABLE IF NOT EXISTS business_profile_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  address JSONB NOT NULL,
  phone VARCHAR(40) NOT NULL,
  email VARCHAR(255),
  website VARCHAR(2048),
  category_id VARCHAR(255) NOT NULL,
  hours JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_profile_settings_tenant_id_idx ON business_profile_settings(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS business_profile_settings_tenant_id_unique ON business_profile_settings(tenant_id);

CREATE TABLE IF NOT EXISTS google_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES google_connections(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES google_business_profiles(id) ON DELETE SET NULL,
  operation google_sync_operation NOT NULL,
  status google_sync_log_status NOT NULL DEFAULT 'in_progress',
  message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_sync_logs_tenant_id_idx ON google_sync_logs(tenant_id);
CREATE INDEX IF NOT EXISTS google_sync_logs_profile_id_idx ON google_sync_logs(profile_id);
CREATE INDEX IF NOT EXISTS google_sync_logs_created_at_idx ON google_sync_logs(created_at);