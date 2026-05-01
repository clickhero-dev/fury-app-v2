import { pgTable, uuid, text, varchar, timestamp, jsonb, pgEnum, index, } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// Enums
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member']);
export const creativeTypeEnum = pgEnum('creative_type', ['image', 'video', 'copy']);
export const complianceStatusEnum = pgEnum('compliance_status', ['pending', 'approved', 'rejected']);
export const campaignStatusEnum = pgEnum('campaign_status', ['draft', 'active', 'paused', 'archived']);
// Tenants table
export const tenants = pgTable('tenants', {
    id: uuid('id').primaryKey().default(sql `gen_random_uuid()`),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    slugIdx: index('tenants_slug_idx').on(table.slug),
}));
// Users table
export const users = pgTable('users', {
    id: uuid('id').primaryKey().default(sql `gen_random_uuid()`),
    tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantIdIdx: index('users_tenant_id_idx').on(table.tenantId),
    emailTenantIdx: index('users_email_tenant_idx').on(table.email, table.tenantId),
}));
// Meta connections table
export const metaConnections = pgTable('meta_connections', {
    id: uuid('id').primaryKey().default(sql `gen_random_uuid()`),
    tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    metaUserId: varchar('meta_user_id', { length: 255 }).notNull(),
    accessToken: text('access_token').notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    adAccounts: jsonb('ad_accounts').default(sql `'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantIdIdx: index('meta_connections_tenant_id_idx').on(table.tenantId),
    metaUserIdIdx: index('meta_connections_meta_user_id_idx').on(table.metaUserId),
}));
// Campaigns table
export const campaigns = pgTable('campaigns', {
    id: uuid('id').primaryKey().default(sql `gen_random_uuid()`),
    tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    metaCampaignId: varchar('meta_campaign_id', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    status: campaignStatusEnum('status').notNull().default('draft'),
    budget: jsonb('budget').default(sql `'{}'::jsonb`),
    metrics: jsonb('metrics').default(sql `'{}'::jsonb`),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantIdIdx: index('campaigns_tenant_id_idx').on(table.tenantId),
    metaCampaignIdIdx: index('campaigns_meta_campaign_id_idx').on(table.metaCampaignId),
}));
// Creative assets table
export const creativeAssets = pgTable('creative_assets', {
    id: uuid('id').primaryKey().default(sql `gen_random_uuid()`),
    tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    type: creativeTypeEnum('type').notNull(),
    url: text('url').notNull(),
    metaAssetId: varchar('meta_asset_id', { length: 255 }),
    complianceStatus: complianceStatusEnum('compliance_status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantIdIdx: index('creative_assets_tenant_id_idx').on(table.tenantId),
    metaAssetIdIdx: index('creative_assets_meta_asset_id_idx').on(table.metaAssetId),
}));
// Client goals table
export const clientGoals = pgTable('client_goals', {
    id: uuid('id').primaryKey().default(sql `gen_random_uuid()`),
    tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    objective: varchar('objective', { length: 255 }).notNull(),
    monthlyBudget: jsonb('monthly_budget').default(sql `'{}'::jsonb`),
    targetCpa: jsonb('target_cpa').default(sql `'{}'::jsonb`),
    niche: varchar('niche', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantIdIdx: index('client_goals_tenant_id_idx').on(table.tenantId),
}));
// FURY insights table
export const furyInsights = pgTable('fury_insights', {
    id: uuid('id').primaryKey().default(sql `gen_random_uuid()`),
    tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
        .notNull()
        .references(() => campaigns.id, { onDelete: 'cascade' }),
    suggestionType: varchar('suggestion_type', { length: 255 }).notNull(),
    suggestionData: jsonb('suggestion_data').default(sql `'{}'::jsonb`),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantIdIdx: index('fury_insights_tenant_id_idx').on(table.tenantId),
    campaignIdIdx: index('fury_insights_campaign_id_idx').on(table.campaignId),
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
};
//# sourceMappingURL=schema.js.map