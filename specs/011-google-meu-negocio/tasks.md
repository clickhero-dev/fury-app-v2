# Tasks: Google Meu Negócio (Google Business Profile)

**Input**: Design documents from `/specs/011-google-meu-negocio/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests ARE requested — the plan lists 4 API test suites. Write tests FIRST and confirm they FAIL before implementing each story (Red-Green-Refactor, Constitution III).

**Organization**: Tasks are grouped by user story (US1–US6). Each story is independently implementable and testable. Foundational phase (Phase 2) BLOCKS all stories.

## Format: `[ID] [P] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Exact file paths included in every description
- Acceptance criteria (AC) at the end of each task

## Path Conventions

- Monorepo: `apps/api/src/`, `apps/web/src/`, `packages/db/src/`
- All API endpoints under `/api/google` (contracts/api.md)
- All frontend work under `apps/web/src/pages/configuracoes/google-meu-negocio/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Environment config, feature scaffolding and route registration needed before any story work.

- [ ] T001 Create Google OAuth env config validation in `apps/api/src/lib/google-oauth.ts` (reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`) with `MISSING_ENV` AppError (pattern `meta.service.ts:getRequiredEnv`). AC: missing env throws `AppError(500, 'MISSING_ENV')` with clear message; envs read once at module load.
- [ ] T002 [P] Add Google env vars to `apps/api/.env.example` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_API_MOCK=true`) + document `GOOGLE_API_MOCK` mock mode in `quickstart.md`. AC: dev starts with `GOOGLE_API_MOCK=true` without Google Cloud credentials/allowlist; prod path documented.
- [ ] T003 [P] Register Google feature router in `apps/api/src/routes/index.ts` (`router.use('/google', googleRoutes)`) — creates the mount point. AC: `/api/google` routes are reachable; import compiles under `tsc -b`.

**Checkpoint**: `tsc -b` passes; `/api/google` mount point exists.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB schema, migration, RLS and the Google API client layer that EVERY user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 Add Google enums + 4 tables to `packages/db/src/schema.ts`: `googleVerificationStateEnum`, `googleSyncStatusEnum`, `googleSyncOperationEnum`, `googleSyncLogStatusEnum`; `googleConnections`, `googleBusinessProfiles`, `businessProfileSettings`, `googleSyncLogs` per data-model.md. AC: Drizzle tables match data-model.md exactly (columns, indexes, uniques, FKs with cascade/set-null); enums exported; `db.query.google*` relations work.
- [ ] T005 Create migration `packages/db/migrations/0028_google_meu_negocio.sql` + register `0028_google_meu_negocio` in `STEPS` of `packages/db/src/migrate.ts`. AC: `pnpm db:migrate` applies cleanly; `CREATE TYPE` x4 + `CREATE TABLE` x4 + indexes/uniques match schema.ts.
- [ ] T006 [P] Add RLS policies for the 4 new tables in `packages/db/migrations/enable_rls.sql` (`google_connections_tenant_isolation`, `google_business_profiles_tenant_isolation`, `business_profile_settings_tenant_isolation`, `google_sync_logs_tenant_isolation`) using `tenant_id = current_setting('app.current_tenant_id')::uuid`. AC: every new table has RLS enabled + tenant policy; audited by `npm run security:audit`.
- [ ] T007 [P] Implement `apps/api/src/lib/google-oauth.ts` — `exchangeCodeForToken` + `refreshAccessToken` against `https://oauth2.googleapis.com/token` (fetch nativo, `GoogleApiError` on failure). AC: code→token exchange returns `{ access_token, refresh_token, expires_in, id_token }`; refresh uses `grant_type=refresh_token`; errors are typed `AppError` with `GOOGLE_TOKEN_EXPIRED` when refresh fails.
- [ ] T008 [P] Implement `apps/api/src/lib/google-api.ts` — GBP REST client (`https://mybusiness.googleapis.com/v4`) with: `listAccounts`, `listLocations`, `createLocation`, `searchGoogleLocations`, `getLocation`, `patchLocation`, `fetchVerificationOptions`, `verifyLocation`, `listVerifications`, `listCategories`; silent token refresh (5-min window before `tokenExpiresAt`); `GOOGLE_API_MOCK=true` mock mode (pattern `meta-api.ts`); typed `GoogleApiError`. AC: every method returns typed data; mock mode returns deterministic fixtures for all 18 contract endpoints; refresh is transparent to callers.
- [ ] T009 Create shared Google Zod schemas + error codes in `apps/api/src/controllers/google.controller.ts` (or `apps/api/src/schemas/google.schemas.ts` if preferred): `settingsSchema`, `profileUpdateSchema`, `verificationSchema`, `connectionIdParamsSchema`, plus error codes `VALIDATION_ERROR`, `MISSING_ENV`, `GOOGLE_TOKEN_EXPIRED`, `INVALID_OAUTH_STATE`, `NOT_FOUND`, `BUSINESS_SETTINGS_INCOMPLETE`, `DUPLICATE_LOCATION`, `GBP_CREATION_NOT_SUPPORTED`, `GBP_UPDATE_REJECTED`, `INVALID_CATEGORY`, `FORBIDDEN`. AC: all 18 endpoints validate via Zod; error codes match contracts/api.md table.

**Checkpoint**: Foundation ready — `pnpm db:migrate` applies, `tsc -b` passes, google-api client mocked, all user stories can now start.

---

## Phase 3: User Story 1 — Conexão da conta Google e verificação de perfil existente (Priority: P1) 🎯 MVP

**Goal**: OAuth connect (pattern Meta) + lookup whether a GBP profile already exists, in < 30s (SC-001).

**Independent Test**: Connect Google in the new page and see lookup result (found / not found / error) without leaving the page.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T010 [P] [US1] OAuth unit tests in `apps/api/src/__tests__/google-oauth.test.ts`: state JWT signing/expiry (10m), code→token exchange, AES-256-GCM token encryption at rest (`utils/crypto.ts` `iv:tag:ciphertext`), upsert 1-por-tenant, `INVALID_OAUTH_STATE` on bad state, callback redirects `?connected=true`. AC: tests FAIL before implementation; pass after T011.
- [ ] T011 [P] [US1] Lookup unit tests in `apps/api/src/__tests__/google-lookup.test.ts`: `googleLocations:search` returns matches; duplicate detection sets `duplicateAlert` (FR-011 regression); tenant isolation (tenant A never sees tenant B data). AC: tests FAIL before implementation; pass after T012.

### Implementation for User Story 1

- [ ] T012 [US1] Implement OAuth flow in `apps/api/src/services/google.service.ts` + wire `GET /auth/url` and `GET /auth/callback` in `apps/api/src/routes/google.routes.ts` + `apps/api/src/controllers/google.controller.ts`. AC: `GET /api/google/auth/url?context=settings` returns `{ authUrl }` (400 on invalid context); `GET /api/google/auth/callback` exchanges code, encrypts+upserts `google_connections` (1/tenant), redirects `{FRONTEND_URL}/configuracoes/google-meu-negocio?connected=true`, error redirects `?error=oauth_cancelled|invalid_state|token_exchange_failed`; callback is PUBLIC (no auth).
- [ ] T013 [US1] Implement connection read/disconnect in `google.service.ts` + `GET /connections` and `DELETE /connections/:id` routes/controller. AC: `GET /connections` returns connection or `data: null`; `DELETE` revokes token (`POST oauth2.googleapis.com/revoke`), cascades profiles, keeps `business_profile_settings`, 404 for other-tenant ids; tokens never returned to client (only `googleUserId`, `accountId`, `accountName`, `tokenExpiresAt`, `connected`).
- [ ] T014 [US1] Implement `GET /accounts` (GBP account list + `selectedAccountId` persisted) in `google.service.ts` + routes/controller. AC: response matches contract `{ accounts, selectedAccountId }`; selection upserts `accountId/accountName` on connection.
- [ ] T015 [US1] Implement `GET /lookup` (uses `business_profile_settings` + `googleLocations:search`) in `google.service.ts` + routes/controller. AC: response `{ found, matches[], duplicateAlert }` per contract; `GOOGLE_TOKEN_EXPIRED` (401) on refresh failure with pt-BR message; works without profile (uses settings/tenant data).
- [ ] T016 [US1] Create `apps/web/src/types/google.ts` (`GoogleConnection`, `GoogleBusinessProfile`, `GoogleSyncLog`, lookup/settings types). AC: types mirror API contracts; used by all web components.
- [ ] T017 [US1] Create `apps/web/src/pages/configuracoes/google-meu-negocio/useGoogleMeuNegocio.ts` — React Query hooks (pattern `IntegracoesContent`): `useGoogleConnection`, `useGoogleLookup`, `useGoogleAccounts`, connect/disconnect mutations. AC: hooks invalidate query cache on mutation; handle `oauth_cancelled`/error search params with toast.
- [ ] T018 [P] [US1] Create `GoogleConnectionCard.tsx` in `apps/web/src/pages/configuracoes/google-meu-negocio/components/` (connect/reconnect/disconnect + OAuth status, pattern `ConnectionCard` in `IntegracoesContent.tsx`). AC: shows active/expired token state, "Conectar Google" triggers OAuth redirect, "Desconectar" confirms via dialog, error state in pt-BR.
- [ ] T019 [P] [US1] Create `ProfileLookupResult.tsx` in `apps/web/src/pages/configuracoes/google-meu-negocio/components/` (found / not found / duplicate → claim suggestion, FR-011). AC: renders lookup result states; duplicate shows "Reivindicar perfil" instead of "Criar"; loading/error states clear.
- [ ] T020 [US1] Create `GoogleMeuNegocioPage.tsx` in `apps/web/src/pages/configuracoes/google-meu-negocio/` + register `/configuracoes/google-meu-negocio` in `apps/web/src/router.tsx` (pattern `Integracoes.tsx`: `ErrorBoundary` + `AppLayout`). AC: page renders connection card + lookup result; OAuth callback redirect lands here with `?connected=true`.

**Checkpoint**: US1 fully functional — connect account, see lookup result (SC-001). Story independently testable.

---

## Phase 4: User Story 4 — Nova aba de configurações para dados do negócio (Priority: P1) 🎯 MVP

**Goal**: Form to fill/review business data (`business_profile_settings`), pre-filled from tenant — the SOURCE for create/update. Do this BEFORE US2/US3 (they consume these data).

**Independent Test**: Save business data in the new page; data becomes available to create/update the Google profile.

### Tests for User Story 4 ⚠️

> **NOTE: Tests optional for this story (frontend has 0% coverage — not in MVP). Backend Zod validation covered by existing test conventions.**

### Implementation for User Story 4

- [ ] T021 [US4] Implement settings GET/PUT in `google.service.ts` + `GET /settings` + `PUT /settings` routes/controller. AC: `GET /settings` returns settings, pre-filled from `tenants.name` + `tenants.businessContext` with `prefilledFrom` array when never saved; `PUT /settings` validates Zod (name, address, phone required), 400 `VALIDATION_ERROR` with `fields`, 422 `INVALID_CATEGORY` on bad category; upsert 1/tenant; `categoryDisplayName` resolved from catalog.
- [ ] T022 [US4] Implement `GET /categories?query=` autocomplete (Business Information API `accounts.categories.list`, debounce + in-memory short cache, FR-012) in `google.service.ts` + routes/controller. AC: returns `{ categories: [{ categoryId, displayName, parentId }] }`; server-side validation against official catalog on create/update.
- [ ] T023 [US4] Create `BusinessProfileForm.tsx` in `apps/web/src/pages/configuracoes/google-meu-negocio/components/` (name, address, phone, email, website, category autocomplete, hours; pre-fill from settings/tenant). AC: form pre-fills from `GET /settings` (incl. tenant name/businessContext); required-field validation blocks submit (endereço+telefone); category autocomplete with debounce; saving calls `PUT /settings` and refetches.
- [ ] T024 [US4] Add `BusinessProfileForm` to `GoogleMeuNegocioPage.tsx` composition. AC: page shows form alongside connection/lookup; save success toast + query cache invalidation.

**Checkpoint**: US4 complete — business data source available for US2/US3.

---

## Phase 5: User Story 2 — Criação de novo perfil com dados completos da empresa (Priority: P1) 🎯 MVP

**Goal**: Create GBP profile from `business_profile_settings`, track verification status, fallback to claim/manual guidance (FR-003, Q2).

**Independent Test**: Client without profile creates one; sees "aguardando verificação" + Google verification instructions.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T025 [P] [US2] Verification unit tests in `apps/api/src/__tests__/google-verification.test.ts`: `fetchVerificationOptions` returns methods; `verifyLocation` sends PIN for PHONE/EMAIL; postal guidance for POSTAL; state transitions `awaiting_verification → verified`. AC: tests FAIL before implementation; pass after T027.
- [ ] T026 [P] [US2] Creation regression tests in `apps/api/src/__tests__/google-lookup.test.ts` (extend): `POST /profiles` blocked with 409 `DUPLICATE_LOCATION` when lookup confidence HIGH; `GBP_CREATION_NOT_SUPPORTED` (422) on API refusal → manual orientation. AC: tests FAIL before implementation; pass after T027.

### Implementation for User Story 2

- [ ] T027 [US2] Implement create + verification in `google.service.ts` + `POST /profiles`, `GET /profiles/:id/verification`, `POST /profiles/:id/verification/complete` routes/controller. AC: `POST /profiles` validates settings complete (400 `BUSINESS_SETTINGS_INCOMPLETE`), blocks on HIGH-confidence duplicate (409 `DUPLICATE_LOCATION` + claim guidance), creates location on GBP, persists profile mirror with `syncStatus: awaiting_verification` + `google_sync_logs` entry, 422 `GBP_CREATION_NOT_SUPPORTED` on API refusal; verification endpoints match contract (options + instructions pt-BR; complete sends PIN or guides postal).
- [ ] T028 [US2] Add create/verification UI to `useGoogleMeuNegocio.ts` (`useCreateProfile`, `useVerification`) + wire into `GoogleMeuNegocioPage.tsx`/`ProfileLookupResult.tsx`. AC: "Criar perfil" button only when settings complete; after create, status shows `aguardando verificação` + official instructions; duplicate path shows claim CTA; missing-field errors block submit.

**Checkpoint**: US2 complete — create profile + verification guidance (SC-002).

---

## Phase 6: User Story 3 — Atualização e gerenciamento de perfil existente (Priority: P1) 🎯 MVP

**Goal**: Display GBP-fetched data (not local), edit + sync to GBP, friendly rejection errors (FR-004).

**Independent Test**: Edit working hours; change reflects in Google after sync.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T029 [P] [US3] Profile sync unit tests in `apps/api/src/__tests__/google-profile-sync.test.ts`: PATCH → `syncStatus: syncing` → confirmed `verified`; `GBP_UPDATE_REJECTED` (409) with reason mapped to friendly message; tenant isolation. AC: tests FAIL before implementation; pass after T030.

### Implementation for User Story 3

- [x] T030 [US3] Implement get/update/sync in `google.service.ts` + `GET /profiles`, `PATCH /profiles/:id`, `POST /profiles/:id/sync` routes/controller. AC: `GET /profiles` returns GBP-fetched mirror (or `data: null`); `PATCH` validates partial Zod, sets `syncing`, patches GBP location, maps rejections to `GBP_UPDATE_REJECTED` 409 with pt-BR reason, logs to `google_sync_logs`; `POST /:id/sync` triggers immediate sync.
- [x] T031 [US3] Implement photos (FR-006 — manual association ONLY) in `google.service.ts` + `POST /profiles/:id/photos` (multipart) + `DELETE /profiles/:id/photos?url=` routes/controller. AC: upload goes to Cloudflare R2 via `storage.service.ts` (bucket `fury-studio-assets`), URL added to `photos` jsonb; NEVER calls GBP media endpoints; delete removes from R2 (`deleteAsset`) + array; response `{ photos, associatedManually: true }`.
- [x] T032 [US3] Create `PhotoUploader.tsx` in `apps/web/src/pages/configuracoes/google-meu-negocio/components/` (upload + list + remove, manual association). AC: uploads via multipart to `POST /photos`; photo list rendered from profile `photos`; remove calls `DELETE /photos`; explicit label that photos are stored locally, not published to Google.
- [x] T033 [US3] Add edit/sync/photo UI to `useGoogleMeuNegocio.ts` + wire into `GoogleMeuNegocioPage.tsx` (`BusinessProfileForm` prefilled from GBP profile data when editing). AC: profile data displayed comes from GBP (not local settings); edit shows `sincronizando` → confirmed; `GBP_UPDATE_REJECTED` shows friendly reason.

**Checkpoint**: US3 complete — manage existing profile, SC-003 (first-sync success) + C7 photo scenario.

---

## Phase 7: User Story 5 — Interface de visualização, status e notificações do perfil (Priority: P2)

**Goal**: Unified status panel + history (`sync-logs`) + email notifications on transitions (FR-005, SC-004).

**Independent Test**: Profile status changes to "verificado" after Google confirms; client notified (email) and panel updated in < 1 min.

### Tests for User Story 5 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T034 [P] [US5] Sync worker unit tests in `apps/api/src/__tests__/google-profile-sync.test.ts` (extend): BullMQ job syncs `awaiting_verification`/`syncing` profiles, transitions → `verified`, writes sync-log, triggers email notification; per-tenant isolation. AC: tests FAIL before implementation; pass after T035.

### Implementation for User Story 5

- [x] T035 [US5] Implement `apps/api/src/services/google-sync.worker.ts` — BullMQ `repeat` job (`* * * * *`, pattern `publish-due-manager`) that syncs `awaiting_verification`/`syncing` profiles from GBP, updates `syncStatus`, writes `google_sync_logs`, and enqueues email via `email.service.ts` on transitions (verified, error). AC: no aggressive polling (quota 300 QPM respected); transition → notification < 1 min (SC-004); per-tenant scoped.
- [x] T036 [US5] Implement `GET /profiles/:id/sync-logs?limit=` in `google.service.ts` + routes/controller. AC: returns `{ logs: [{ id, operation, status, message, createdAt }] }` chronological (index `created_at`); tenant-scoped.
- [x] T037 [US5] Create `ProfileStatusPanel.tsx` in `apps/web/src/pages/configuracoes/google-meu-negocio/components/` (status badge, lastSyncedAt, sync logs history, "Tentar novamente" on error → `POST /:id/sync`). AC: renders all `syncStatus` values (not_connected → error); shows last sync + history; retry re-syncs on error; matches C6.
- [x] T038 [US5] Wire `ProfileStatusPanel` into `GoogleMeuNegocioPage.tsx` + `useGoogleSyncLogs` hook. AC: panel visible with profile; status transitions reflected after sync job runs.

**Checkpoint**: US5 complete — status + history + notifications (SC-004, C6).

---

## Phase 8: User Story 6 — Google Meu Negócio Patrocinado (Priority: P2 ⚠️ Requer clarificação)

**Goal**: MVP scoped per research.md Decision 2 (Q1): eligibility gate (profile `verified`) + CTA redirecting the client to configure Google Ads campaign (location extensions) — Google Ads API integration and billing are OUT of this story/MVP. Client pays Google directly.

**Independent Test**: Verified-profile client activates the sponsored CTA and is redirected to Google Ads setup.

### Implementation for User Story 6

- [ ] T039 [US6] Add sponsored eligibility check to `google.service.ts` + `GET /profiles` (returns `eligibleForSponsored: syncStatus === 'verified'`). AC: eligibility derived from `syncStatus`; no new tables/endpoints for ads in MVP.
- [ ] T040 [US6] Add sponsored CTA UI to `ProfileStatusPanel.tsx`/`GoogleMeuNegocioPage.tsx`: shown only when eligible; opens Google Ads (location extension) setup in new tab with pt-BR guidance; blocked state with config guidance when not eligible/no payment method. AC: verified profiles see "Ativar Patrocinado" → redirect; unverified/not-eligible see explanation; no payment processed by Ady.
- [ ] T041 [US6] Document sponsorship scope + billing flow (client pays Google) in `specs/011-google-meu-negocio/` (append to tasks or note in research.md). AC: clarificação Q1 recorded; scope explicit (no Ady billing).

**Checkpoint**: US6 scoped MVP delivered (eligibility gate + redirect). Full Google Ads integration deferred pending product/billing clarification.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting all stories + final validation.

- [ ] T042 [P] Run `tsc -b` on API+web+db and fix type errors. AC: `pnpm build` compiles cleanly.
- [ ] T043 [P] Run API unit tests `pnpm test:unit` + new google suites (`google-oauth`, `google-lookup`, `google-profile-sync`, `google-verification`) and ensure green. AC: all suites pass; Red-Green-Refactor respected.
- [ ] T044 [P] Run `pnpm lint` (api + web) on changed files. AC: no new lint errors; code style matches repo (no comments unless required).
- [ ] T045 [P] Run `npm run security:audit` — verify RLS on all 4 new tables, no token leakage, OAuth callback security (state JWT validated, no auth on callback). AC: audit passes; tenant isolation verified (SC-005).
- [ ] T046 [P] Validate `quickstart.md` scenarios C1–C8 end-to-end with `GOOGLE_API_MOCK=true`. AC: each scenario completes; env/mock documented.
- [ ] T047 Update `specs/011-google-meu-negocio/plan.md` status notes + `specs/011-google-meu-negocio/tasks.md` checkboxes as tasks complete. AC: docs reflect implementation reality.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Phase 2 only.
- **US4 (Phase 4)**: Depends on Phase 2 only. Do before US2/US3 (data source).
- **US2 (Phase 5)**: Depends on Phase 2 + US4 (uses `business_profile_settings`) + US1 (needs connection/lookup).
- **US3 (Phase 6)**: Depends on Phase 2 + US1 (needs connection). May reuse US4 form for editing.
- **US5 (Phase 7)**: Depends on Phase 2 + US2/US3 (status transitions observed).
- **US6 (Phase 8)**: Depends on US3/US5 (needs `verified` eligibility + status panel).
- **Polish (Phase 9)**: Depends on all desired user stories complete.

### User Story Dependencies

- **US1 (P1)**: Start after Phase 2 — no other story deps.
- **US4 (P1)**: Start after Phase 2 — no other story deps. Schedule before US2/US3.
- **US2 (P1)**: After Phase 2 + US1 + US4.
- **US3 (P1)**: After Phase 2 + US1.
- **US5 (P2)**: After US2/US3.
- **US6 (P2)**: After US3/US5 — requires product clarification (Q1 resolved in research.md Decision 2: Google Ads extension, MVP = eligibility gate + redirect).

### Within Each User Story

- Tests (requested for US1, US2, US3, US5) MUST be written and FAIL before implementation.
- Models/migration before services; services before routes/controller; backend before frontend.
- Story complete before moving to next priority.

### Parallel Opportunities

- All [P] tasks in a phase can run in parallel (different files).
- T004/T005/T006/T007/T008 (Phase 2) are parallelizable after T001–T003.
- US1 and US4 can proceed in parallel after Phase 2 (staffing permitting).
- Tests within a story marked [P] run in parallel.
- Different user stories can be worked in parallel by different team members (respecting story deps above).

---

## Implementation Strategy

### MVP First (US1 + US4 → US2 → US3)

1. Phase 1 Setup + Phase 2 Foundational (CRITICAL — blocks all stories).
2. US1 (connect + lookup) + US4 (business data source).
3. US2 (create) → US3 (manage). **STOP and VALIDATE**: SC-001, SC-002, SC-003, C1–C5, C7, C8.
4. Deploy/demo if ready (P1 stories complete).

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 + US4 → test independently → SC-001.
3. US2 → test independently → SC-002.
4. US3 → test independently → SC-003.
5. US5 → test independently → SC-004 (P2).
6. US6 → eligibility gate (P2, clarified scope).
7. Each story adds value without breaking previous stories.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to user story for traceability.
- Each user story independently completable and testable.
- Verify tests FAIL before implementing (Red-Green-Refactor, Constitution III).
- Commit after each task or logical group (conventional commits).
- Constitution guardrails: layer separation (routes → controllers → services → db), DI (services receive deps by parameter — no `import { db }` in business logic), Zod validation on every endpoint, envelope `ApiResponse<T>`, RLS tenant isolation on all tables.
- Explicit feature limits: reviews NEVER auto-responded (no review endpoints); photos NEVER published to GBP API (manual association only, R2 local).