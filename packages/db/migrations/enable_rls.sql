-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fury_insights ENABLE ROW LEVEL SECURITY;

-- Create policies for tenants (allow access only to own tenant)
CREATE POLICY tenants_tenant_isolation ON tenants
  USING (id = current_setting('app.current_tenant_id')::uuid);

-- Create policies for users
CREATE POLICY users_tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Create policies for meta_connections
CREATE POLICY meta_connections_tenant_isolation ON meta_connections
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Create policies for campaigns
CREATE POLICY campaigns_tenant_isolation ON campaigns
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Create policies for creative_assets
CREATE POLICY creative_assets_tenant_isolation ON creative_assets
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Create policies for client_goals
CREATE POLICY client_goals_tenant_isolation ON client_goals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Create policies for fury_insights
CREATE POLICY fury_insights_tenant_isolation ON fury_insights
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Enable RLS on Google Meu Negocio tables
ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profile_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_sync_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for google_connections
CREATE POLICY google_connections_tenant_isolation ON google_connections
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Create policies for google_business_profiles
CREATE POLICY google_business_profiles_tenant_isolation ON google_business_profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Create policies for business_profile_settings
CREATE POLICY business_profile_settings_tenant_isolation ON business_profile_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Create policies for google_sync_logs
CREATE POLICY google_sync_logs_tenant_isolation ON google_sync_logs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
