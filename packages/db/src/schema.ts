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
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member']);
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
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('member'),
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('meta_connections_tenant_id_idx').on(table.tenantId),
    metaUserIdIdx: index('meta_connections_meta_user_id_idx').on(table.metaUserId),
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
    enabled: text('enabled').notNull().default('true'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ruleType: text('rule_type').notNull(), // 'pause_high_cpa' | 'pause_low_roas' | 'pause_zero_conversions' | 'budget_limit'
    isActive: boolean('is_active').notNull().default(true),
    threshold: numeric('threshold').notNull(),
    action: text('action').notNull().default('pause'), // 'pause' | 'notify' | 'reduce_budget'
  },
  (table) => ({
    tenantIdIdx: index('automation_rules_tenant_id_idx').on(table.tenantId),
  })
);

// Budget optimizations table
export const budgetOptimizations = pgTable(
  'budget_optimizations',
// Performance rules table
export const performanceRules = pgTable(
  'performance_rules',
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
};
