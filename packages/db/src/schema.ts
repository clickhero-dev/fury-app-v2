import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  pgEnum,
  index,
  boolean,
  numeric,
  integer,
  unique,
  inet,
  bigint,
  bigserial,
  smallint,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member', 'superadmin']);
export const conditionFieldEnum = pgEnum('condition_field', ['cpc', 'ctr', 'roas', 'cpa', 'spend']);
export const conditionOperatorEnum = pgEnum('condition_operator', ['gt', 'lt', 'eq']);
export const ruleActionEnum = pgEnum('rule_action', ['pause_campaign', 'reduce_budget', 'notify', 'increase_budget']);
export const performanceGradeEnum = pgEnum('performance_grade', ['A', 'B', 'C', 'D', 'F']);
export const creativeTypeEnum = pgEnum('creative_type', ['image', 'video', 'copy']);
export const complianceStatusEnum = pgEnum('compliance_status', [
  'pending',
  'pending_compliance',
  'approved',
  'rejected',
]);
export const campaignStatusEnum = pgEnum('campaign_status', ['draft', 'active', 'paused', 'archived']);
export const budgetOptimizationStatusEnum = pgEnum('budget_optimization_status', [
  'pending',
  'applied',
  'rejected',
]);
export const budgetModeEnum = pgEnum('budget_mode', ['suggestion', 'auto']);
export const planIntervalEnum = pgEnum('plan_interval', ['monthly', 'yearly']);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial',
  'active',
  'past_due',
  'cancelled',
  'inactive',
]);
export const invoiceStatusEnum = pgEnum('invoice_status', ['pending', 'paid', 'overdue', 'cancelled']);
export const voiceToneEnum = pgEnum('voice_tone', ['professional', 'casual', 'urgent', 'premium']);
export const formSubmissionStatusEnum = pgEnum('form_submission_status', ['PENDING', 'COMPLETED', 'ERROR', 'ABANDONED']);
export const googleVerificationStateEnum = pgEnum('google_verification_state', ['UNVERIFIED', 'VERIFIED']);

export const googleSyncStatusEnum = pgEnum('google_sync_status', [
  'not_connected',
  'connected',
  'no_profile',
  'awaiting_verification',
  'verified',
  'syncing',
  'synced',
  'error',
]);

export const googleSyncOperationEnum = pgEnum('google_sync_operation', [
  'oauth_connect',
  'lookup',
  'create',
  'update',
  'verify',
  'sync',
  'error',
]);

export const googleSyncLogStatusEnum = pgEnum('google_sync_log_status', ['pending', 'in_progress', 'success', 'failed']);

// Tenants table
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    codigo: varchar('codigo', { length: 20 }).unique(),
    businessContext: text('business_context'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index('tenants_slug_idx').on(table.slug),
    codigoIdx: index('tenants_codigo_idx').on(table.codigo),
  })
);

// Users table
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash'),
    googleId: varchar('google_id', { length: 255 }),
    role: userRoleEnum('role').notNull().default('member'),
    notificationPrefs: jsonb('notification_prefs').default(sql`'{"campanhas":true,"performance":true,"equipe":false}'::jsonb`),
    audienceDefaults: jsonb('audience_defaults').default(sql`'{"city":"","ageMin":18,"ageMax":65,"gender":"all"}'::jsonb`),
    otpCode: varchar('otp_code', { length: 6 }),
    otpExpiresAt: timestamp('otp_expires_at', { withTimezone: true }),
    emailVerified: boolean('email_verified').notNull().default(false),
    resetToken: varchar('reset_token', { length: 255 }),
    resetTokenExpiresAt: timestamp('reset_token_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('users_tenant_id_idx').on(table.tenantId),
    emailTenantIdx: index('users_email_tenant_idx').on(table.email, table.tenantId),
  })
);

// Meta connections table
export const metaConnections = pgTable(
  'meta_connections',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    metaUserId: varchar('meta_user_id', { length: 255 }).notNull(),
    accessToken: text('access_token').notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    adAccounts: jsonb('ad_accounts').default(sql`'[]'::jsonb`),
    selectedAdAccountId: varchar('selected_ad_account_id', { length: 255 }),
    selectedBusinessIds: jsonb('selected_business_ids').default(sql`'[]'::jsonb`),
    selectedPageIds: jsonb('selected_page_ids').default(sql`'[]'::jsonb`),
    selectedAdAccountIds: jsonb('selected_ad_account_ids').default(sql`'[]'::jsonb`),
    selectedWhatsappNumberIds: jsonb('selected_whatsapp_number_ids').default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('meta_connections_tenant_id_idx').on(table.tenantId),
    metaUserIdIdx: index('meta_connections_meta_user_id_idx').on(table.metaUserId),
    tenantIdUnique: unique('meta_connections_tenant_id_unique').on(table.tenantId),
  })
);

// Campaigns table
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    metaCampaignId: varchar('meta_campaign_id', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    status: campaignStatusEnum('status').notNull().default('draft'),
    budget: jsonb('budget').default(sql`'{}'::jsonb`),
    metrics: jsonb('metrics').default(sql`'{}'::jsonb`),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('campaigns_tenant_id_idx').on(table.tenantId),
    metaCampaignIdIdx: index('campaigns_meta_campaign_id_idx').on(table.metaCampaignId),
  })
);

// Creative assets table
export const creativeAssets = pgTable(
  'creative_assets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    type: creativeTypeEnum('type').notNull(),
    url: text('url').notNull(),
    metaAssetId: varchar('meta_asset_id', { length: 255 }),
    complianceStatus: complianceStatusEnum('compliance_status').notNull().default('pending_compliance'),
    complianceNotes: text('compliance_notes'),
    rootAssetId: uuid('root_asset_id').references((): AnyPgColumn => creativeAssets.id),
    modificationsRemaining: integer('modifications_remaining'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('creative_assets_tenant_id_idx').on(table.tenantId),
    metaAssetIdIdx: index('creative_assets_meta_asset_id_idx').on(table.metaAssetId),
    rootAssetIdIdx: index('creative_assets_root_asset_id_idx').on(table.rootAssetId),
  })
);

// Client goals table
export const clientGoals = pgTable(
  'client_goals',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    objective: varchar('objective', { length: 255 }).notNull(),
    monthlyBudget: jsonb('monthly_budget').default(sql`'{}'::jsonb`),
    targetCpa: jsonb('target_cpa').default(sql`'{}'::jsonb`),
    niche: varchar('niche', { length: 255 }),
    mainProduct: varchar('main_product', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('client_goals_tenant_id_idx').on(table.tenantId),
  })
);

// FURY insights table
export const furyInsights = pgTable(
  'fury_insights',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    suggestionType: varchar('suggestion_type', { length: 255 }).notNull(),
    suggestionData: jsonb('suggestion_data').default(sql`'{}'::jsonb`),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('fury_insights_tenant_id_idx').on(table.tenantId),
    campaignIdIdx: index('fury_insights_campaign_id_idx').on(table.campaignId),
  })
);

// Automation rules table
export const automationRules = pgTable(
  'automation_rules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    trigger: varchar('trigger', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ruleType: text('rule_type').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    threshold: numeric('threshold').notNull(),
    action: text('action').notNull().default('pause'),
  },
  (table) => ({
    tenantIdIdx: index('automation_rules_tenant_id_idx').on(table.tenantId),
  })
);

// Budget optimizations table
export const budgetOptimizations = pgTable(
  'budget_optimizations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    totalBudget: numeric('total_budget').notNull(),
    adjustments: jsonb('adjustments').default(sql`'[]'::jsonb`),
    mode: budgetModeEnum('mode').notNull().default('suggestion'),
    status: budgetOptimizationStatusEnum('status').notNull().default('pending'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('budget_optimizations_tenant_id_idx').on(table.tenantId),
    statusIdx: index('budget_optimizations_status_idx').on(table.status),
  })
);

// Performance rules table
export const performanceRules = pgTable(
  'performance_rules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    conditionField: conditionFieldEnum('condition_field').notNull(),
    conditionOperator: conditionOperatorEnum('condition_operator').notNull(),
    conditionValue: numeric('condition_value').notNull(),
    action: ruleActionEnum('action').notNull(),
    actionValue: numeric('action_value'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('performance_rules_tenant_id_idx').on(table.tenantId),
  })
);

// Performance scores table
export const performanceScores = pgTable(
  'performance_scores',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    grade: performanceGradeEnum('grade').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
    metricsSnapshot: jsonb('metrics_snapshot').default(sql`'{}'::jsonb`),
  },
  (table) => ({
    campaignIdIdx: index('performance_scores_campaign_id_idx').on(table.campaignId),
    tenantIdIdx: index('performance_scores_tenant_id_idx').on(table.tenantId),
    computedAtIdx: index('performance_scores_computed_at_idx').on(table.computedAt),
  })
);

// Rule executions table
export const ruleExecutions = pgTable(
  'rule_executions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => performanceRules.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    triggeredAt: timestamp('triggered_at', { withTimezone: true }).defaultNow().notNull(),
    actionTaken: varchar('action_taken', { length: 255 }).notNull(),
    result: jsonb('result').default(sql`'{}'::jsonb`),
  },
  (table) => ({
    ruleIdIdx: index('rule_executions_rule_id_idx').on(table.ruleId),
    campaignIdIdx: index('rule_executions_campaign_id_idx').on(table.campaignId),
    triggeredAtIdx: index('rule_executions_triggered_at_idx').on(table.triggeredAt),
  })
);

// FURY config table (per-tenant scoring benchmarks)
export const furyConfig = pgTable(
  'fury_config',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' })
      .unique(),
    targetRoas: numeric('target_roas', { precision: 10, scale: 2 }).notNull().default('4.00'),
    targetCpa: numeric('target_cpa', { precision: 10, scale: 2 }).notNull().default('50.00'),
    targetCtr: numeric('target_ctr', { precision: 10, scale: 2 }).notNull().default('3.00'),
    targetBudgetUtilization: numeric('target_budget_utilization', { precision: 5, scale: 2 }).notNull().default('80.00'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('fury_config_tenant_id_idx').on(table.tenantId),
  })
);

// Form submissions table
export const formSubmissions = pgTable(
  'form_submissions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    formType: varchar('form_type', { length: 255 }).notNull(),
    status: formSubmissionStatusEnum('status').notNull().default('PENDING'),
    abandonedAt: timestamp('abandoned_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('form_submissions_tenant_id_idx').on(table.tenantId),
    userIdIdx: index('form_submissions_user_id_idx').on(table.userId),
    formTypeIdx: index('form_submissions_form_type_idx').on(table.formType),
    statusIdx: index('form_submissions_status_idx').on(table.status),
    tenantFormTypeIdx: index('form_submissions_tenant_form_type_idx').on(table.tenantId, table.formType),
  })
);

// ==================== Billing ====================

// Plans table (global — not per-tenant)
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  priceCents: integer('price_cents').notNull(),
  interval: planIntervalEnum('interval').notNull().default('monthly'),
  features: jsonb('features').notNull().default(sql`'{}'::jsonb`),
  limits: jsonb('limits').notNull().default(sql`'{}'::jsonb`),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Subscriptions table
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    asaasSubscriptionId: varchar('asaas_subscription_id', { length: 255 }),
    asaasCustomerId: varchar('asaas_customer_id', { length: 255 }),
    status: subscriptionStatusEnum('status').notNull().default('trial'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    creativesRemaining: integer('creatives_remaining'),
    isNonExpirable: boolean('is_non_expirable').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('subscriptions_tenant_id_idx').on(table.tenantId),
    statusIdx: index('subscriptions_status_idx').on(table.status),
  })
);

// Invoices table
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    asaasPaymentId: varchar('asaas_payment_id', { length: 255 }),
    amountCents: integer('amount_cents').notNull(),
    status: invoiceStatusEnum('status').notNull().default('pending'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('invoices_tenant_id_idx').on(table.tenantId),
    subscriptionIdIdx: index('invoices_subscription_id_idx').on(table.subscriptionId),
    statusIdx: index('invoices_status_idx').on(table.status),
  })
);

// Brand kits table
export const brandKits = pgTable(
  'brand_kits',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    logoUrl: text('logo_url'),
    primaryColor: varchar('primary_color', { length: 7 }),
    secondaryColor: varchar('secondary_color', { length: 7 }),
    voiceTone: voiceToneEnum('voice_tone'),
    photoUrls: jsonb('photo_urls').default(sql`'[]'::jsonb`),
    whatsappNumber: text('whatsapp_number'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('brand_kits_tenant_id_idx').on(table.tenantId),
  })
);

// Request logs table (audit / debug)
// Partitioned by RANGE (created_at) — PK is (id, created_at) at DB level.
// Drizzle schema mirrors the production columns for type-safe queries.
export const requestLogs = pgTable(
  'request_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    requestId: uuid('request_id'),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    method: varchar('method', { length: 10 }).notNull(),
    path: text('path').notNull(),
    queryString: text('query_string'),
    statusCode: smallint('status_code').notNull(),
    responseTimeMs: integer('response_time_ms').notNull(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    referer: text('referer'),
    requestHeaders: jsonb('request_headers'),
    requestBody: jsonb('request_body'),
    responseBody: jsonb('response_body'),
    errorMessage: text('error_message'),
  },
  (table) => ({
    tenantCreatedIdx: index('idx_request_logs_tenant_created').on(table.tenantId, table.createdAt),
    statusCreatedIdx: index('idx_request_logs_status_created').on(table.statusCode, table.createdAt),
    requestIdIdx: index('idx_request_logs_request_id').on(table.requestId),
  })
);

// ===== Planejador IA tables =====

export const postTypeEnum = pgEnum('post_type', ['reel', 'carousel', 'image', 'stories']);
export const postStatusEnum = pgEnum('post_status', ['draft', 'approved', 'rejected', 'published', 'confirmed', 'failed']);
export const planStatusEnum = pgEnum('plan_status', ['draft', 'active', 'completed', 'cancelled']);

export const campaignPlans = pgTable(
  'campaign_plans',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }),
    type: varchar('type', { length: 20 }).notNull().default('monthly'),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    objective: text('objective'),
    status: planStatusEnum('status').notNull().default('draft'),
    totalPosts: integer('total_posts').default(0),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    strategy: jsonb('strategy').default(sql`'{}'::jsonb`),
    researchData: jsonb('research_data').default(sql`'{}'::jsonb`),
    analyticsData: jsonb('analytics_data').default(sql`'{}'::jsonb`),
    brandingChecked: boolean('branding_checked').default(false),
    brandingNotes: text('branding_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('campaign_plans_tenant_id_idx').on(table.tenantId),
  })
);

export const socialPosts = pgTable(
  'social_posts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => campaignPlans.id, { onDelete: 'set null' }),
    platform: varchar('platform', { length: 50 }).notNull().default('instagram'),
    postType: postTypeEnum('post_type').notNull().default('image'),
    title: varchar('title', { length: 255 }),
    caption: text('caption'),
    cta: varchar('cta', { length: 255 }),
    hashtags: jsonb('hashtags').default(sql`'[]'::jsonb`),
    imagePrompt: text('image_prompt'),
    imageUrl: text('image_url'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    status: postStatusEnum('status').notNull().default('draft'),
    platformPostId: varchar('platform_post_id', { length: 255 }),
    metrics: jsonb('metrics').default(sql`'{}'::jsonb`),
    dayIndex: integer('day_index'), // dia do mês (1-31) para ordenação no calendário
    publishAttempts: integer('publish_attempts').default(0).notNull(),
    lastPublishError: text('last_publish_error'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('social_posts_tenant_id_idx').on(table.tenantId),
    planIdIdx: index('social_posts_plan_id_idx').on(table.planId),
  })
);

export const campaignPlansRelations = relations(campaignPlans, ({ many }) => ({
  posts: many(socialPosts),
}));

export const socialPostsRelations = relations(socialPosts, ({ one }) => ({
  plan: one(campaignPlans, {
    fields: [socialPosts.planId],
    references: [campaignPlans.id],
  }),
}));

// ===== Google Meu Negócio (Google Business Profile) tables =====

export const googleConnections = pgTable(
  'google_connections',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    googleUserId: varchar('google_user_id', { length: 255 }).notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
    accountId: varchar('account_id', { length: 255 }),
    accountName: varchar('account_name', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('google_connections_tenant_id_idx').on(table.tenantId),
    googleUserIdIdx: index('google_connections_google_user_id_idx').on(table.googleUserId),
    tenantIdUnique: unique('google_connections_tenant_id_unique').on(table.tenantId),
  })
);

export const googleBusinessProfiles = pgTable(
  'google_business_profiles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => googleConnections.id, { onDelete: 'cascade' }),
    gbpLocationId: varchar('gbp_location_id', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    address: jsonb('address').notNull(),
    phone: varchar('phone', { length: 40 }),
    email: varchar('email', { length: 255 }),
    website: varchar('website', { length: 2048 }),
    categoryId: varchar('category_id', { length: 255 }),
    categoryDisplayName: varchar('category_display_name', { length: 255 }),
    hours: jsonb('hours'),
    photos: jsonb('photos').default(sql`'[]'::jsonb`),
    verificationState: googleVerificationStateEnum('verification_state').notNull().default('UNVERIFIED'),
    syncStatus: googleSyncStatusEnum('sync_status').notNull().default('no_profile'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('google_business_profiles_tenant_id_idx').on(table.tenantId),
    gbpLocationIdIdx: index('google_business_profiles_gbp_location_id_idx').on(table.gbpLocationId),
    syncStatusIdx: index('google_business_profiles_sync_status_idx').on(table.syncStatus),
    tenantIdUnique: unique('google_business_profiles_tenant_id_unique').on(table.tenantId),
  })
);

export const businessProfileSettings = pgTable(
  'business_profile_settings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    address: jsonb('address').notNull(),
    phone: varchar('phone', { length: 40 }).notNull(),
    email: varchar('email', { length: 255 }),
    website: varchar('website', { length: 2048 }),
    categoryId: varchar('category_id', { length: 255 }).notNull(),
    hours: jsonb('hours'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('business_profile_settings_tenant_id_idx').on(table.tenantId),
    tenantIdUnique: unique('business_profile_settings_tenant_id_unique').on(table.tenantId),
  })
);

export const googleSyncLogs = pgTable(
  'google_sync_logs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => googleConnections.id, { onDelete: 'set null' }),
    profileId: uuid('profile_id').references(() => googleBusinessProfiles.id, { onDelete: 'set null' }),
    operation: googleSyncOperationEnum('operation').notNull(),
    status: googleSyncLogStatusEnum('status').notNull().default('in_progress'),
    message: text('message'),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('google_sync_logs_tenant_id_idx').on(table.tenantId),
    profileIdx: index('google_sync_logs_profile_id_idx').on(table.profileId),
    createdAtIdx: index('google_sync_logs_created_at_idx').on(table.createdAt),
  })
);

export const googleConnectionsRelations = relations(googleConnections, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [googleConnections.tenantId],
    references: [tenants.id],
  }),
  profile: one(googleBusinessProfiles),
  syncLogs: many(googleSyncLogs),
}));

export const googleBusinessProfilesRelations = relations(googleBusinessProfiles, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [googleBusinessProfiles.tenantId],
    references: [tenants.id],
  }),
  connection: one(googleConnections, {
    fields: [googleBusinessProfiles.connectionId],
    references: [googleConnections.id],
  }),
  syncLogs: many(googleSyncLogs),
}));

export const businessProfileSettingsRelations = relations(businessProfileSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [businessProfileSettings.tenantId],
    references: [tenants.id],
  }),
}));

export const googleSyncLogsRelations = relations(googleSyncLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [googleSyncLogs.tenantId],
    references: [tenants.id],
  }),
  connection: one(googleConnections, {
    fields: [googleSyncLogs.connectionId],
    references: [googleConnections.id],
  }),
  profile: one(googleBusinessProfiles, {
    fields: [googleSyncLogs.profileId],
    references: [googleBusinessProfiles.id],
  }),
}));

// Export all tables
export const allTables = {
  tenants,
  users,
  metaConnections,
  campaigns,
  creativeAssets,
  clientGoals,
  furyInsights,
  automationRules,
  budgetOptimizations,
  performanceRules,
  performanceScores,
  ruleExecutions,
  furyConfig,
  formSubmissions,
  plans,
  subscriptions,
  invoices,
  brandKits,
  requestLogs,
  campaignPlans,
  socialPosts,
  googleConnections,
  googleBusinessProfiles,
  businessProfileSettings,
  googleSyncLogs,
};
