# Implementation Plan: Deploy Build Gate

**Branch**: `fix/deploy-build-gate` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

## Summary

Corrigir o erro de compilação que derrubou o deploy e fechar o buraco de
processo que o deixou passar: tornar o CI (`tsc -b && build && test:unit`)
um required check em `dev`, para que nenhum commit quebrado chegue ao Docker
build do EasyPanel. Root cause é de processo, não de código — o fix do TS já
está no working tree.

## Technical Context

**Stack**: TypeScript 5.x, React 18 + Vite (apps/web), Express (apps/api),
monorepo npm workspaces. CI via GitHub Actions. Deploy via EasyPanel (Docker
build no push para `dev`).

**Escopo**: 1 fix de código (já feito, uncommitted) + config de branch
protection + amendment na Constitution. Zero dependências novas.

## Constitution Check

| Gate | Status | Rationale |
|------|--------|-----------|
| III. Test-First Quality Gates | ✅ PASS | Este trabalho *fortalece* o gate — passa a ser required check. |
| V. Simplicity & YAGNI | ✅ PASS | Reusa o `ci.yml` existente. Nenhuma action nova; só branch protection. |
| VI. Build-Before-Deploy (novo) | ✅ ADICIONA | Este plano introduz o princípio na Constitution 1.1.0. |

## Phases

### Phase 0 — Fix imediato (desbloqueia deploy)
- Commitar a correção já presente em `PlanejadorPage.tsx` (toggle
  `showCalendar` + prop `onViewCalendar`). Verificado: `tsc -b` exit 0.
- Commit: `fix(planejador): add onViewCalendar prop to PlanSummary — unblock build`

### Phase 1 — Gate de compilação (previne recorrência)
- Ativar **branch protection** em `dev` no GitHub:
  - Required status check: job `check` do `ci.yml`.
  - Require branches up to date before merge.
- Nada muda no `ci.yml` — ele já roda `tsc -b`, `npm run build`, `test:unit`.

### Phase 2 — Constitution amendment
- Adicionar Princípio VI (Build-Before-Deploy Gate) e reforço de TDD para
  bug recorrente. Bump para 1.1.0. (Feito em paralelo — ver constitution.md.)

### Phase 3 — Regression check (TDD do comportamento)
- Teste de comportamento do `PlanejadorPage`: no estado `review`, renderiza
  `PlanSummary` e, ao clicar "Ver calendário", troca para `CalendarView`.
  Cobre o contrato da prop que quebrou. (apps/web hoje tem 0 testes — este
  vira o primeiro; setup mínimo de vitest + testing-library.)

## Project Structure

```text
apps/web/src/pages/planejador/
├── PlanejadorPage.tsx              # fix (Phase 0)
└── PlanejadorPage.test.tsx         # regression (Phase 3)

.specify/memory/constitution.md      # amendment 1.1.0 (Phase 2)
.github/                             # branch protection (via UI/API, Phase 1)
specs/003-deploy-build-gate/
├── spec.md
└── plan.md
```

## Complexity Tracking

| Decisão | Por quê |
|---------|---------|
| Não criar GitHub Action nova | `ci.yml` já cobre; falta só torná-lo required. |
| Regression test em vez de e2e | O bug foi contrato de props → typecheck já pega; 1 teste de comportamento fecha o TDD sem framework e2e. |
