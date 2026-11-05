CREATE TYPE "public"."budget_mode" AS ENUM('suggestion', 'auto');--> statement-breakpoint
CREATE TYPE "public"."budget_optimization_status" AS ENUM('pending', 'applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."condition_field" AS ENUM('cpc', 'ctr', 'roas', 'cpa', 'spend');--> statement-breakpoint
CREATE TYPE "public"."condition_operator" AS ENUM('gt', 'lt', 'eq');--> statement-breakpoint
CREATE TYPE "public"."form_submission_status" AS ENUM('PENDING', 'COMPLETED', 'ERROR', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."performance_grade" AS ENUM('A', 'B', 'C', 'D', 'F');--> statement-breakpoint
CREATE TYPE "public"."plan_interval" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'approved', 'rejected', 'published', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."post_type" AS ENUM('carousel', 'image', 'stories');--> statement-breakpoint
CREATE TYPE "public"."rule_action" AS ENUM('pause_campaign', 'reduce_budget', 'notify', 'increase_budget');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'cancelled', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."voice_tone" AS ENUM('professional', 'casual', 'urgent', 'premium');--> statement-breakpoint
ALTER TYPE "public"."compliance_status" ADD VALUE 'pending_compliance' BEFORE 'approved';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'superadmin';--> statement-breakpoint
CREATE TABLE "brand_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"logo_url" text,
	"primary_color" varchar(7),
	"secondary_color" varchar(7),
	"voice_tone" "voice_tone",
	"photo_urls" jsonb DEFAULT '[]'::jsonb,
	"whatsapp_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_kits_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "budget_optimizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"total_budget" numeric NOT NULL,
	"adjustments" jsonb DEFAULT '[]'::jsonb,
	"mode" "budget_mode" DEFAULT 'suggestion' NOT NULL,
	"status" "budget_optimization_status" DEFAULT 'pending' NOT NULL,
	"applied_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(255),
	"type" varchar(20) DEFAULT 'monthly' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"objective" text,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"total_posts" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"strategy" jsonb DEFAULT '{}'::jsonb,
	"research_data" jsonb DEFAULT '{}'::jsonb,
	"analytics_data" jsonb DEFAULT '{}'::jsonb,
	"branding_checked" boolean DEFAULT false,
	"branding_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"form_type" varchar(255) NOT NULL,
	"status" "form_submission_status" DEFAULT 'PENDING' NOT NULL,
	"abandoned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fury_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"target_roas" numeric(10, 2) DEFAULT '4.00' NOT NULL,
	"target_cpa" numeric(10, 2) DEFAULT '50.00' NOT NULL,
	"target_ctr" numeric(10, 2) DEFAULT '3.00' NOT NULL,
	"target_budget_utilization" numeric(5, 2) DEFAULT '80.00' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fury_config_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"asaas_payment_id" varchar(255),
	"amount_cents" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"condition_field" "condition_field" NOT NULL,
	"condition_operator" "condition_operator" NOT NULL,
	"condition_value" numeric NOT NULL,
	"action" "rule_action" NOT NULL,
	"action_value" numeric,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"grade" "performance_grade" NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metrics_snapshot" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"price_cents" integer NOT NULL,
	"interval" "plan_interval" DEFAULT 'monthly' NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" uuid,
	"tenant_id" uuid,
	"user_id" uuid,
	"method" varchar(10) NOT NULL,
	"path" text NOT NULL,
	"query_string" text,
	"status_code" smallint NOT NULL,
	"response_time_ms" integer NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"referer" text,
	"request_headers" jsonb,
	"request_body" jsonb,
	"response_body" jsonb,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "rule_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action_taken" varchar(255) NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid,
	"platform" varchar(50) DEFAULT 'instagram' NOT NULL,
	"post_type" "post_type" DEFAULT 'image' NOT NULL,
	"title" varchar(255),
	"caption" text,
	"cta" varchar(255),
	"hashtags" jsonb DEFAULT '[]'::jsonb,
	"image_prompt" text,
	"image_url" text,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"platform_post_id" varchar(255),
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"day_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"asaas_subscription_id" varchar(255),
	"asaas_customer_id" varchar(255),
	"status" "subscription_status" DEFAULT 'trial' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_assets" ALTER COLUMN "compliance_status" SET DEFAULT 'pending_compliance';--> statement-breakpoint
ALTER TABLE "automation_rules" ADD COLUMN "name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD COLUMN "trigger" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "client_goals" ADD COLUMN "main_product" varchar(500);--> statement-breakpoint
ALTER TABLE "creative_assets" ADD COLUMN "compliance_notes" text;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "selected_ad_account_id" varchar(255);--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "selected_business_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "selected_page_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "selected_ad_account_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "selected_whatsapp_number_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "codigo" varchar(20);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "business_context" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notification_prefs" jsonb DEFAULT '{"campanhas":true,"performance":true,"equipe":false}'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "audience_defaults" jsonb DEFAULT '{"city":"","ageMin":18,"ageMax":65,"gender":"all"}'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "otp_code" varchar(6);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "otp_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_token" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_optimizations" ADD CONSTRAINT "budget_optimizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_plans" ADD CONSTRAINT "campaign_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fury_config" ADD CONSTRAINT "fury_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_rules" ADD CONSTRAINT "performance_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_scores" ADD CONSTRAINT "performance_scores_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_scores" ADD CONSTRAINT "performance_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_rule_id_performance_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."performance_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_plan_id_campaign_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."campaign_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_kits_tenant_id_idx" ON "brand_kits" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "budget_optimizations_tenant_id_idx" ON "budget_optimizations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "budget_optimizations_status_idx" ON "budget_optimizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_plans_tenant_id_idx" ON "campaign_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "form_submissions_tenant_id_idx" ON "form_submissions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "form_submissions_user_id_idx" ON "form_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "form_submissions_form_type_idx" ON "form_submissions" USING btree ("form_type");--> statement-breakpoint
CREATE INDEX "form_submissions_status_idx" ON "form_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "form_submissions_tenant_form_type_idx" ON "form_submissions" USING btree ("tenant_id","form_type");--> statement-breakpoint
CREATE INDEX "fury_config_tenant_id_idx" ON "fury_config" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invoices_tenant_id_idx" ON "invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invoices_subscription_id_idx" ON "invoices" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "performance_rules_tenant_id_idx" ON "performance_rules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "performance_scores_campaign_id_idx" ON "performance_scores" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "performance_scores_tenant_id_idx" ON "performance_scores" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "performance_scores_computed_at_idx" ON "performance_scores" USING btree ("computed_at");--> statement-breakpoint
CREATE INDEX "idx_request_logs_tenant_created" ON "request_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_request_logs_status_created" ON "request_logs" USING btree ("status_code","created_at");--> statement-breakpoint
CREATE INDEX "idx_request_logs_request_id" ON "request_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "rule_executions_rule_id_idx" ON "rule_executions" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "rule_executions_campaign_id_idx" ON "rule_executions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "rule_executions_triggered_at_idx" ON "rule_executions" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX "social_posts_tenant_id_idx" ON "social_posts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "social_posts_plan_id_idx" ON "social_posts" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_id_idx" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenants_codigo_idx" ON "tenants" USING btree ("codigo");--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_tenant_id_unique" UNIQUE("tenant_id");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_codigo_unique" UNIQUE("codigo");