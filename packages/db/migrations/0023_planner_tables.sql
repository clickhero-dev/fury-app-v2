DO $$ BEGIN
  CREATE TYPE "post_type" AS ENUM ('reel', 'carousel', 'image', 'stories');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "post_status" AS ENUM ('draft', 'approved', 'rejected', 'published');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "plan_status" AS ENUM ('draft', 'active', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "campaign_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"(id) ON DELETE CASCADE,
  "title" varchar(255),
  "type" varchar(20) NOT NULL DEFAULT 'monthly',
  "period_start" timestamp WITH TIME ZONE,
  "period_end" timestamp WITH TIME ZONE,
  "objective" text,
  "status" "plan_status" NOT NULL DEFAULT 'draft',
  "total_posts" integer DEFAULT 0,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updated_at" timestamp WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "campaign_plans_tenant_id_idx" ON "campaign_plans"("tenant_id");

CREATE TABLE IF NOT EXISTS "social_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"(id) ON DELETE CASCADE,
  "plan_id" uuid REFERENCES "campaign_plans"(id) ON DELETE SET NULL,
  "platform" varchar(50) NOT NULL DEFAULT 'instagram',
  "post_type" "post_type" NOT NULL DEFAULT 'image',
  "title" varchar(255),
  "caption" text,
  "cta" varchar(255),
  "hashtags" jsonb DEFAULT '[]'::jsonb,
  "image_prompt" text,
  "image_url" text,
  "scheduled_at" timestamp WITH TIME ZONE,
  "published_at" timestamp WITH TIME ZONE,
  "status" "post_status" NOT NULL DEFAULT 'draft',
  "platform_post_id" varchar(255),
  "metrics" jsonb DEFAULT '{}'::jsonb,
  "day_index" integer,
  "created_at" timestamp WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updated_at" timestamp WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "social_posts_tenant_id_idx" ON "social_posts"("tenant_id");
CREATE INDEX IF NOT EXISTS "social_posts_plan_id_idx" ON "social_posts"("plan_id");
