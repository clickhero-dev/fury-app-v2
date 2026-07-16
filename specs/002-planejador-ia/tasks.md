# Tasks: Planejador IA — Resiliência, validação prévia e reconciliação de docs

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Clarify**: [clarify.md](./clarify.md)

## T001 — Endpoint GET /planner/prerequisites

- **Arquivo novo/alterados**:
  - `apps/api/src/services/planner.service.ts` — função `getPrerequisites(tenantId)`:
    - `metaConnected`: verifica `meta_connections` com token não expirado
    - `hasProduct`: verifica `clientGoals.mainProduct`
    - `hasObjective`: verifica `clientGoals.objective`
    - `hasVoiceTone`: verifica `brandKits.voiceTone`
  - `apps/api/src/controllers/planner.controller.ts` — `handleGetPrerequisites`
  - `apps/api/src/routes/planner.routes.ts` — `GET /planner/prerequisites`
- **Teste**: `prerequisites.test.ts` — mock DB calls, verifica resposta correta com dados parciais

## T002 — IdleStatus com checklist dinâmico

- **Arquivo**: `apps/web/src/pages/planejador/components/IdleStatus.tsx`
  - Receber `checks: { label: string; ok: boolean }[]` via props
  - Renderizar dinamicamente: `CheckCircle` (verde) se ok, `AlertCircle` (amarelo) se não
  - Botão "Gerar" desabilitado se algum check for false + tooltip explicativa
- **Arquivo**: `apps/web/src/pages/planejador/PlanejadorPage.tsx`
  - `useQuery` para `GET /planner/prerequisites` no mount
  - Passar `checks` como prop para `IdleStatus`
  - Estado de loading/erro ao buscar prerequisites

## T003 — Doc reconciliation

- **spec.md**: 
  - US1 Scenario 3: atualizar de "exibe resumo do plano" para "redireciona para o calendário"
  - FR-001: marcar como implementado com endpoint dedicado
  - Remover cenários que contradizem FR-006/009/010
- **plan.md**:
  - Structure: atualizar view states (remover review/confirmed)
  - Structure: atualizar contagem de arquivos
  - Remover data-model.md/quickstart.md/contracts/ da estrutura de docs

## Ordem

T001 (backend independente) → T002 (frontend depende de T001) → T003 (docs, pode fazer junto)

## T004 — Critério de "Meta conectada" (bug fix, 2026-07-16)

- **Raiz**: `apps/api/src/services/planner.service.ts:60-79` — `getPrerequisites` define
  `metaConnected = !!meta` (só `tokenExpiresAt > now`). Não exige página selecionada.
- **Fix (raiz)**: `metaConnected` = `tokenExpiresAt > now AND selectedPageIds != '[]'::jsonb`.
  - SQL: `findFirst` where `and(eq(tenantId), gt(tokenExpiresAt, now), sql\`${metaConnections.selectedPageIds} != '[]'::jsonb\`)`.
  - Frontend (`PlanejadorPage.tsx`, `IdleStatus.tsx`) e `tenantMiddleware` NÃO mudam — já consomem `pre.metaConnected` certo.
- **Teste de regressão** (Constituição III, TDD): `apps/api/src/__tests__/planner-prerequisites.test.ts`
  - tenant token válido + `selectedPageIds: ['page_1']` → `metaConnected: true`
  - tenant token válido + `selectedPageIds: []` → `metaConnected: false`
  - tenant token expirado + page → `metaConnected: false`
  - Teste falha antes do fix, passa depois.
- **Arquivos**: só `planner.service.ts` (lógica) + novo `planner-prerequisites.test.ts`.

## Ordem (bug fix)

T004 (backend + teste, independente do frontend) — pode rodar em paralelo com T001/T002/T003.
