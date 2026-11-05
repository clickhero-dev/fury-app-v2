# Quickstart: Google Meu Negócio

## Pré-requisitos

- API rodando: `http://localhost:3000` (via `pnpm dev` em `apps/api`)
- Frontend rodando: `http://localhost:5173` (via `pnpm dev` em `apps/web`)
- PostgreSQL: container `fury-postgres` na porta 5444 (base `fury_test`)
- Migration aplicada: `0028_google_meu_negocio` (`pnpm db:migrate`)
- **Credenciais GBP**: projeto no Google Cloud + Business Profile API habilitada + OAuth Client (escopo `business.manage`) + [pedido de acesso aprovado](https://developers.google.com/my-business/content/prereqs) (quota 300 QPM). Sem isso, usar `GOOGLE_API_MOCK=true`.

## Setup

```bash
# .env de apps/api — novos vars
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/auth/callback
GOOGLE_API_MOCK=true   # true em dev sem allowlist; false em prod aprovado

# 1. Migration
pnpm db:migrate

# 2. API
cd apps/api && pnpm dev

# 3. Frontend
cd apps/web && pnpm dev
```

## Cenários de Teste

### C1 — Conexão da conta Google e verificação de perfil existente (US1)

1. Acessar `http://localhost:5173/configuracoes/google-meu-negocio`
2. Clicar "Conectar Google" → redirect para o Google (ou fluxo mock)
3. Autorizar e voltar → `?connected=true`
4. Ver o card de conexão ativa e o resultado do lookup (encontrado / não encontrado)

**Esperado**: resultado da verificação em < 30s (SC-001), sem sair da página.

### C2 — Criação de perfil novo (US2)

1. Sem perfil encontrado, preencher dados do negócio no formulário (nome, endereço, telefone, email, site, categoria, horário)
2. Clicar "Criar perfil"
3. Ver status `aguardando verificação` + instruções oficiais (cartão postal/telefone/email)

**Esperado**: perfil criado na GBP API e persistido; fluxo completo em < 5 min (SC-002).

### C3 — Validação de formulário (US2/US4)

1. Deixar endereço e telefone vazios → tentar salvar/criar
2. Ver campos sinalizados e envio bloqueado

**Esperado**: bloqueio no client + `VALIDATION_ERROR` no backend (Zod).

### C4 — Gerenciamento de perfil existente (US3)

1. Com perfil encontrado, editar horário de funcionamento
2. Salvar → ver status `sincronizando` → `verificado`
3. Consultar o perfil no Google e conferir a atualização

**Esperado**: dados exibidos vêm da GBP (não locais); `GBP_UPDATE_REJECTED` exibe mensagem amigável se a Google recusar.

### C5 — Duplicado → reivindicação (FR-011)

1. Endereço corresponde a um perfil já existente no Maps (criado por terceiros)
2. Ver alerta `duplicateAlert` + opção "Reivindicar perfil" em vez de criar outro

**Esperado**: criação bloqueada (`DUPLICATE_LOCATION`), fluxo de reivindicação orientado.

### C6 — Status, notificações e sincronização (US5/FR-005)

1. Perfil em `aguardando verificação`: concluir verificação (via Google ou mock)
2. Ver status mudar para `verificado` automaticamente (job BullMQ) e receber email de notificação
3. Abrir o painel de status e conferir histórico (`sync-logs`) + última sincronização

**Esperado**: transição refletida em < 1 min (SC-004) com email + painel atualizado.

### C7 — Fotos: associação manual apenas (FR-006)

1. Com perfil verificado, fazer upload de uma foto
2. Ver a foto associada localmente (R2)

**Esperado**: foto **nunca** publicada na GBP API; remoção via `DELETE /photos`.

### C8 — Token expirado / reconexão (FR-010)

1. Deixar o access token expirar (~1h) e tentar uma ação
2. Ver refresh silencioso (sem fricção) — ou, se refresh falhar, mensagem clara orientando reconectar, preservando os dados preenchidos

**Esperado**: zero perda de dados preenchidos; `GOOGLE_TOKEN_EXPIRED` orienta reconexão.

## Estrutura de Arquivos

```
specs/011-google-meu-negocio/       ← Documentação da feature (spec, plan, research, data-model, contracts, quickstart)
packages/db/src/schema.ts           ← + googleConnections, googleBusinessProfiles, businessProfileSettings, googleSyncLogs
packages/db/migrations/             ← + 0028_google_meu_negocio.sql + políticas RLS em enable_rls.sql
packages/db/src/migrate.ts          ← + entry no STEPS
apps/api/src/lib/google-api.ts       ← Cliente REST GBP + refresh silencioso + GOOGLE_API_MOCK
apps/api/src/lib/google-oauth.ts     ← Troca code→token / refresh
apps/api/src/services/google.service.ts  ← Orquestração OAuth/lookup/create/update/sync
apps/api/src/services/google-sync.worker.ts ← Job BullMQ de sync de status
apps/api/src/controllers/google.controller.ts
apps/api/src/routes/google.routes.ts
apps/api/src/routes/index.ts          ← + /google
apps/api/src/__tests__/               ← google-oauth, google-lookup, google-profile-sync, google-verification
apps/web/src/pages/configuracoes/google-meu-negocio/ ← Página + 5 componentes + hook
apps/web/src/router.tsx               ← + /configuracoes/google-meu-negocio
apps/web/src/types/google.ts
apps/web/.env                         ← VITE_API_URL (já existe)
```

## Notas

- **Mock mode**: com `GOOGLE_API_MOCK=true` o cliente retorna dados fictícios (padrão `META_API_MOCK`) — útil para validar fluxos C1–C8 sem credenciais reais.
- **Testes**: `pnpm test:unit` roda as suites unitárias da API (incl. regressões de duplicado e isolamento de tenant). Testes de integração OAuth exigem Postgres local (`fury_test`).
- **Limitações da feature (explícitas)**: reviews NUNCA respondidos; fotos NUNCA publicadas na GBP API — apenas associação manual local.