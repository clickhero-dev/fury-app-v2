# Implementation Plan: Google Meu Negócio (Google Business Profile)

**Branch**: `feat/google-meu-negocio` | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-google-meu-negocio/spec.md`

## Summary

Criar e gerenciar perfis de empresas no Google (Google Business Profile / GBP) dentro do Ady. O cliente conecta sua conta Google via OAuth 2.0, o Ady verifica se já existe um perfil no Google para o negócio, e então: (1) cria um perfil novo com os dados da empresa, (2) gerencia/atualiza um perfil existente, e (3) acompanha status de verificação e sincronização. Uma nova página em Configurações (`/configuracoes/google-meu-negocio`) coleta/revisa os dados do negócio (fonte primária de dados). Fotos são armazenadas localmente (R2) e associadas manualmente — nunca publicadas na GBP API. Reviews NUNCA são respondidos automaticamente. O "Patrocinado" (P2) é entregue por Google Ads com extensões de localização, com cobrança direta ao Google.

**Abordagem**: Replicar integralmente o padrão de integração OAuth da Meta existente (`meta.routes.ts` → `meta.controller.ts` → `meta.service.ts` → `lib/meta-api.ts`): `GET /auth/url` (estado JWT assinado, expira 10m) → `GET /auth/callback` (troca de code, criptografia AES-256-GCM keyed por `JWT_SECRET`, upsert 1-por-tenant). Cliente REST próprio da GBP em `lib/google-api.ts` (fetch nativo, sem dependência nova), com mock mode `GOOGLE_API_MOCK` espelhando `META_API_MOCK`. Novo guard: a GBP API exige OAuth + aprovação de acesso (allowlist) — sem isso a integração roda em mock. Camadas estritas: rotas → controllers → serviços → acesso a dados.

## Technical Context

**Language/Version**: TypeScript — API `~5.3.x` (`apps/api/package.json`), Web `~6.0.x` (`apps/web/package.json`)

**Primary Dependencies**: Express `^4.18.2` (API), React 19 + Vite 8 + Tailwind 4 (Web), Drizzle ORM `^0.45.2` (DB), zod `^3.22` (API) / `3.23.8` (Web), jsonwebtoken `^9.0.2` (state OAuth), nodemailer `^9.0.3` (email), `@aws-sdk/client-s3` (R2 photos). **Nenhuma dependência nova** — cliente da GBP API implementado à mão em `lib/google-api.ts` (padrão `lib/meta-api.ts`).

**Storage**: PostgreSQL 16 (Neon prod / Docker dev) — novas tabelas `google_connections`, `google_business_profiles`, `business_profile_settings`, `google_sync_logs` + migration `0028_google_meu_negocio.sql` (próximo número após `0027_add_missing_planner_columns.sql`). Fotos: Cloudflare R2 via `storage.service.ts` (bucket `fury-studio-assets`).

**Testing**: Vitest (`apps/api`). Testes unitários de service/controller com DI e mock da GBP (`GOOGLE_API_MOCK`); testes de integração do fluxo OAuth; regressão para duplicado/RLS (Constituição III, Red-Green-Refactor). Sem testes de frontend no MVP (padrão atual).

**Target Platform**: Web (desktop + mobile responsive)

**Project Type**: Monorepo web application (`apps/api` + `apps/web` + `packages/db` + `packages/shared`)

**Performance Goals**: Resultado da verificação de perfil em < 30s (SC-001); criação de perfil em < 5 min de interação (SC-002); notificação de transição de status em < 1 min (SC-004). Respeitar quotas da GBP API (300 QPM default aprovado) — sem polling agressivo; sync de status via job agendado (padrão BullMQ `repeat`, ex. `* * * * *`).

**Constraints**: RLS habilitada em TODAS as tabelas novas com política `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)` (padrão `enable_rls.sql`). Zod em todo endpoint + envelope `ApiResponse<T>`. Serviços com dependências injetáveis (Constituição III/VII), zero `import { db }` dentro de lógica de negócio. Tokens OAuth criptografados em repouso (AES-256-GCM + `JWT_SECRET`, esquema `iv:tag:ciphertext` de `utils/crypto.ts`). `tenantMiddleware` + `authMiddleware` em todas as rotas exceto o callback OAuth (público). `GOOGLE_API_MOCK` para dev sem credenciais/allowlist.

**Scale/Scope**: Dezenas de tenants (pequenos negócios locais, pt-BR), 1 conexão Google por tenant e 1 perfil espelhado por tenant no MVP (padrão `meta_connections` 1-por-tenant). Sync serializado por tenant via fila BullMQ/Redis existente.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Rationale |
|------|--------|-----------|
| I. Security & Multi-Tenant Isolation | ✅ PASS | Todas as 4 tabelas novas com RLS + `tenant_id`; todas as rotas protegidas por `authMiddleware` + `tenantMiddleware` (exceto callback OAuth, que resolve tenant via state JWT assinado, padrão Meta). Tokens criptografados em repouso. `npm run security:audit` antes do deploy. |
| II. API Contracts & Validation | ✅ PASS | Zod schemas em todos os 16 endpoints; envelope `ApiResponse<T>`; erros com `code` máquina-legível + `message` humano (padrão `AppError` + `errorHandler`). |
| III. Test-First Quality Gates | ✅ PASS | Testes unitários dos services com DI (dependências injetadas, mock da GBP via cliente passado por parâmetro); regressão obrigatória para duplicado de perfil e isolamento por tenant; Red-Green-Refactor. |
| IV. AI Integration Discipline | ✅ PASS (N/A) | Feature não utiliza IA (zero chamadas a LLM). Gate não aplicável — marcado PASS por ausência de risco. |
| V. Simplicity & YAGNI | ✅ PASS | Reuso do padrão Meta existente (routes/controller/service/api client), zero dependências novas, sem abstrações especulativas (sem repository pattern, sem cache Redis extra, sem SSE — polling/sync agendado basta). |
| VI. Build-Before-Deploy Gate | ✅ PASS | Novo código compila em `tsc -b && npm run build` e testes unitários passam no CI antes do merge; nenhum deploy quebra por TS. |
| VII. Layer Separation & Code Quality | ✅ PASS | `google.routes.ts` (URL wiring) → `google.controller.ts` (parse/format) → `google.service.ts` (orquestração) → `lib/google-api.ts` (HTTP GBP) / `db` (Drizzle). Funções < 80 linhas; 1 responsabilidade por arquivo; services recebem deps por parâmetro. |

## Project Structure

### Documentation (this feature)

```text
specs/011-google-meu-negocio/
├── spec.md              # Feature specification
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — decisões técnicas e clarificações (Q1–Q5)
├── data-model.md        # Phase 1 output — entidades Drizzle + migration 0028
├── quickstart.md        # Phase 1 output — cenários de validação
├── contracts/           # Phase 1 output — contratos de API
│   └── api.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/db/
├── src/schema.ts             # + googleConnections, googleBusinessProfiles, businessProfileSettings, googleSyncLogs
└── migrations/               # + 0028_google_meu_negocio.sql (+ entrada no STEPS de packages/db/src/migrate.ts)
                               + enable_rls.sql ganha políticas RLS das 4 tabelas novas

apps/api/
├── src/lib/google-api.ts              # Cliente REST GBP (fetch, token refresh silencioso, mock GOOGLE_API_MOCK, GoogleApiError tipado)
├── src/lib/google-oauth.ts            # Troca code→token + refresh (https://oauth2.googleapis.com/token)
├── src/services/google.service.ts     # Orquestração: OAuth callback, lookup, create, update, sync, verificação
├── src/services/google-sync.worker.ts # Job BullMQ de sync de status (repeat, padrão publish-due-manager)
├── src/controllers/google.controller.ts
├── src/routes/google.routes.ts        # 16 endpoints (auth/url, auth/callback, connections, lookup, profiles CRUD, verification, settings, categories, photos)
├── src/routes/index.ts                # + router.use('/google', ...)
├── src/__tests__/google-oauth.test.ts       # Fluxo OAuth + criptografia de tokens
├── src/__tests__/google-lookup.test.ts      # Duplicado via googleLocations.search (regressão)
├── src/__tests__/google-profile-sync.test.ts # Sync status + isolamento tenant
└── src/__tests__/google-verification.test.ts

apps/web/
├── src/pages/configuracoes/google-meu-negocio/
│   ├── GoogleMeuNegocioPage.tsx            # Container (padrão IntegracoesPage: ErrorBoundary + AppLayout)
│   ├── components/
│   │   ├── GoogleConnectionCard.tsx        # Conectar/reconectar/desconectar + status OAuth
│   │   ├── BusinessProfileForm.tsx         # Formulário dados do negócio (BusinessProfileSettings)
│   │   ├── ProfileLookupResult.tsx         # Encontrado / não encontrado / duplicado (reivindicação)
│   │   ├── ProfileStatusPanel.tsx          # Status + última sync + sync logs (US5)
│   │   └── PhotoUploader.tsx               # Upload local (R2) + associação manual
│   └── useGoogleMeuNegocio.ts              # React Query hooks (padrão IntegracoesContent)
├── src/router.tsx                     # + /configuracoes/google-meu-negocio
├── src/types/google.ts                # GoogleConnection, GoogleBusinessProfile, GoogleSyncLog
└── src/lib/api.ts                     # já usado (axios + refresh)
```

**Structure Decision**: Monorepo com 4 pacotes existentes. Nova feature adiciona ~4 tabelas + 1 migration + ~10 source files na API + ~7 arquivos de UI. A página de integração é **rota dedicada** `/configuracoes/google-meu-negocio` (padrão `/configuracoes/integracoes`), não uma tab do `Configuracoes.tsx` — ver research.md Decisão 6 (Q5). Sem novos pacotes, sem dependências novas.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Sem violações de Constituição. Justificativas de complexidade (todas dentro do padrão existente):

| Complexidade | Por que precisa | Alternativa mais simples rejeitada porque |
|--------------|-----------------|------------------------------------------|
| 4 tabelas novas (não 1) | Conexão OAuth (google_connections), espelho do perfil (google_business_profiles), dados-fonte do negócio (business_profile_settings) e histórico (google_sync_logs) têm ciclos de vida independentes | Unir tudo numa tabela acoplaria OAuth a dados de formulário e histórico; `meta_connections` já prova a separação |
| Coluna `refreshToken` em google_connections | Access token do Google expira em ~1h — refresh_token é obrigatório para renovação silenciosa (FR-010); `meta_connections` não guarda refresh (tokens Meta duram 60d) | Sem refresh_token: reconexão manual toda hora quebra SC-001 (verificação < 30s) |
| Job BullMQ de sync de status | FR-005 exige atualização automática de status (verificação concluída → notificado em < 1min) sem ação do cliente | Polling por request do usuário não cobre transições passivas; fila BullMQ já existe (publish-due-manager) |