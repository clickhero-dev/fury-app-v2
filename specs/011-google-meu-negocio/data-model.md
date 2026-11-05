# Data Model: Google Meu Negócio (Google Business Profile)

Migration: `0028_google_meu_negocio.sql` — 4 tabelas novas + políticas RLS em `enable_rls.sql`. Estilo Drizzle ORM (padrão `packages/db/src/schema.ts`).

## Enums

```ts
export const googleVerificationStateEnum = pgEnum('google_verification_state', ['UNVERIFIED', 'VERIFIED']);

export const googleSyncStatusEnum = pgEnum('google_sync_status', [
  'not_connected',
  'connected',
  'no_profile',
  'awaiting_verification',
  'verified',
  'syncing',
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
```

## googleConnections

Conexão OAuth por tenant — espelha `metaConnections` (1 por tenant). **Inclui `refreshToken`** (diferença do Meta: token Google expira em ~1h).

```ts
export const googleConnections = pgTable(
  'google_connections',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    googleUserId: varchar('google_user_id', { length: 255 }).notNull(),
    accessToken: text('access_token').notNull(),       // criptografado (AES-256-GCM, JWT_SECRET)
    refreshToken: text('refresh_token').notNull(),     // criptografado (AES-256-GCM, JWT_SECRET)
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
    accountId: varchar('account_id', { length: 255 }), // contas de negócio selecionada, ex 'accounts/123456'
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
```

**Indexes**: `tenant_id` (idx), `google_user_id` (idx), `tenant_id` UNIQUE.

## googleBusinessProfiles

Perfil da empresa no Google espelhado no Ady (espelho de leitura/escrita do GBP `Location`).

```ts
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
    gbpLocationId: varchar('gbp_location_id', { length: 255 }).notNull(), // 'accounts/123/locations/456'
    name: varchar('name', { length: 255 }).notNull(),
    address: jsonb('address').notNull(),              // { street, city, state, postalCode, country }
    phone: varchar('phone', { length: 40 }),
    email: varchar('email', { length: 255 }),
    website: varchar('website', { length: 2048 }),
    categoryId: varchar('category_id', { length: 255 }),
    categoryDisplayName: varchar('category_display_name', { length: 255 }),
    hours: jsonb('hours'),                            // { monday: [{ open, close }], ... , special: [...] }
    photos: jsonb('photos').default(sql`'[]'::jsonb`), // URLs locais R2 — NUNCA publicadas na GBP API
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
```

**Indexes**: `tenant_id` (idx), `gbp_location_id` (idx), `sync_status` (idx — consumido pelo job de sync), `tenant_id` UNIQUE.

## businessProfileSettings

Dados-fonte do negócio preenchidos na página de Configurações (FR-007). Pré-preenchido de `tenants.name` + `tenants.businessContext`. Fonte primária para criação/atualização do perfil.

```ts
export const businessProfileSettings = pgTable(
  'business_profile_settings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    address: jsonb('address').notNull(),              // { street, city, state, postalCode, country }
    phone: varchar('phone', { length: 40 }).notNull(),
    email: varchar('email', { length: 255 }),
    website: varchar('website', { length: 2048 }),
    categoryId: varchar('category_id', { length: 255 }).notNull(),
    hours: jsonb('hours'),                            // mesmo formato de googleBusinessProfiles.hours
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('business_profile_settings_tenant_id_idx').on(table.tenantId),
    tenantIdUnique: unique('business_profile_settings_tenant_id_unique').on(table.tenantId),
  })
);
```

**Indexes**: `tenant_id` (idx), `tenant_id` UNIQUE.

## googleSyncLogs

Histórico de operações — base do painel de status/notificações (US5, FR-005).

```ts
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
    message: text('message'),                         // humano, pt-BR
    details: jsonb('details'),                        // payload da resposta GBP/erro técnico
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('google_sync_logs_tenant_id_idx').on(table.tenantId),
    profileIdx: index('google_sync_logs_profile_id_idx').on(table.profileId),
    createdAtIdx: index('google_sync_logs_created_at_idx').on(table.createdAt),
  })
);
```

**Indexes**: `tenant_id` (idx), `profile_id` (idx), `created_at` (idx — listagem cronológica do painel).

## Relationships

```
Tenant 1──1 GoogleConnection          (tenant_id unique)
Tenant 1──1 GoogleBusinessProfile     (tenant_id unique)
Tenant 1──1 BusinessProfileSettings   (tenant_id unique)
Tenant 1──N GoogleSyncLog
GoogleConnection 1──1 GoogleBusinessProfile   (connection_id)
GoogleConnection 1──N GoogleSyncLog           (connection_id, nullable)
GoogleBusinessProfile 1──N GoogleSyncLog      (profile_id, nullable)
```

## State Machine — googleBusinessProfiles.syncStatus

```
not_connected ──(OAuth)──▶ connected ──(lookup)──▶ no_profile ──(create)──▶ awaiting_verification
                                                        │                        │
                                              (duplicado: googleLocations      │
                                               :search → alerta reivindicação)  ▼
                                                              (verify/sync)  verified ◀── sync periódico (BullMQ)
                                                no_profile ──▶ awaiting_verification ──▶ verified
                                                 qualquer estado ──(erro)──▶ error ──(tentar novamente)──▶ estado anterior
```

## Migração SQL (resumo)

`0028_google_meu_negocio.sql`: `CREATE TYPE google_verification_state ...; CREATE TYPE google_sync_status ...; CREATE TYPE google_sync_operation ...; CREATE TYPE google_sync_log_status ...;` + 4 `CREATE TABLE` (como acima) + indexes/unique. `enable_rls.sql`: `ALTER TABLE` + política `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)` para cada tabela. Registrar a migration no array `STEPS` de `packages/db/src/migrate.ts`.

## RLS

Cada tabela nova segue o padrão existente (`enable_rls.sql:19-20`):

```sql
CREATE POLICY google_connections_tenant_isolation ON google_connections
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
-- idem para google_business_profiles, business_profile_settings, google_sync_logs
```