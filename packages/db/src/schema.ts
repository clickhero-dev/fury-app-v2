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
  smallint,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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

// Tenants table
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index('tenants_slug_idx').on(table.slug),
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
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('member'),
    notificationPrefs: jsonb('notification_prefs').default(sql`'{"campanhas":true,"performance":true,"equipe":false}'::jsonb`),
    audienceDefaults: jsonb('audience_defaults').default(sql`'{"city":"","ageMin":18,"ageMax":65,"gender":"all"}'::jsonb`),
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('creative_assets_tenant_id_idx').on(table.tenantId),
    metaAssetIdIdx: index('creative_assets_meta_asset_id_idx').on(table.metaAssetId),
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
    id: bigint('id', { mode: 'number' }).notNull().default(sql`nextval('request_logs_id_seq'::regclass)`),
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
};
