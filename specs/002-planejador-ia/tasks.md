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
