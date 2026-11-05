DO $$ BEGIN
  CREATE TYPE "post_type" AS ENUM ('carousel', 'image', 'stories');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "post_status" AS ENUM ('draft', 'approved', 'scheduled', 'published');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "plan_status" AS ENUM ('draft', 'generating', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS campaign_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title VARCHAR(255),
  type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  objective TEXT,
  status plan_status NOT NULL DEFAULT 'draft',
  total_posts INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_plans_tenant_id_idx ON campaign_plans(tenant_id);

CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES campaign_plans(id) ON DELETE SET NULL,
  platform VARCHAR(50) NOT NULL DEFAULT 'instagram',
  post_type post_type NOT NULL DEFAULT 'image',
  title VARCHAR(255),
  caption TEXT,
  cta VARCHAR(255),
  hashtags JSONB DEFAULT '[]'::jsonb,
  image_prompt TEXT,
  image_url TEXT,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  status post_status NOT NULL DEFAULT 'draft',
  platform_post_id VARCHAR(255),
  metrics JSONB DEFAULT '{}'::jsonb,
  day_index INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_posts_plan_id_idx ON social_posts(plan_id);
CREATE INDEX IF NOT EXISTS social_posts_tenant_id_idx ON social_posts(tenant_id);
CREATE INDEX IF NOT EXISTS social_posts_day_idx ON social_posts(day_index);
