# Feature Specification: Deploy Build Gate — Impedir commits quebrados em produção

**Feature Branch**: `fix/deploy-build-gate`

**Created**: 2026-07-16

**Status**: Draft

**Input**: Bug de deploy — `npm run build` falhou no Docker do EasyPanel com erro de
TypeScript (`TS2741: Property 'onViewCalendar' is missing`), derrubando o deploy.
A correção do código já existia localmente, mas o commit quebrado chegou ao build
de produção porque nada bloqueia deploy quando o CI falha.

## Problema

O deploy no EasyPanel roda `npm run build` (que executa `tsc -b && vite build`)
dentro do Dockerfile. Um erro de compilação TypeScript em
`PlanejadorPage.tsx` (uso de `<PlanSummary>` sem a prop obrigatória
`onViewCalendar`) só foi detectado **no build de produção**, não antes.

**Causa raiz**: O workflow `.github/workflows/ci.yml` já roda `tsc -b`,
`npm run build` e `npm run test:unit` — mas:
1. O deploy do EasyPanel dispara no `push` para `dev` **independente do
   resultado do CI**. CI e deploy correm em paralelo, não em série.
2. Não há branch protection exigindo o CI verde antes do merge em `dev`.

Resultado: um commit que não compila é publicado, o Docker build falha, e o
serviço não sobe.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Commit quebrado é barrado antes do deploy (Priority: P1)

Um dev abre PR para `dev` com um erro de compilação. O CI roda `tsc -b` e
`npm run build`, falha, e o merge fica bloqueado. O deploy nunca é acionado
com código quebrado.

**Independent Test**: Um PR com erro de TS deliberado NÃO pode ser mergeado em
`dev`; o check de CI aparece como obrigatório e vermelho.

**Acceptance Scenarios**:
1. **Given** um PR com erro de compilação, **When** o CI roda, **Then** o
   check falha e o botão de merge fica bloqueado.
2. **Given** um PR que compila e passa nos testes, **When** o CI roda, **Then**
   o check fica verde e o merge é liberado.
3. **Given** um push direto em `dev`, **When** o CI falha, **Then** o deploy do
   EasyPanel não é considerado válido (ou não dispara).

### User Story 2 — Bug corrigido não regride (Priority: P1)

O erro específico (`PlanSummary` sem `onViewCalendar`) é resolvido e coberto
pelo gate de compilação, que passa a ser condição de merge.

**Independent Test**: `cd apps/web && npx tsc -b` retorna exit 0 na branch de
correção.

**Acceptance Scenarios**:
1. **Given** a correção aplicada, **When** `tsc -b` roda, **Then** exit 0.
2. **Given** qualquer futura remoção da prop obrigatória, **When** o CI roda,
   **Then** o gate de compilação falha e bloqueia o merge.

### Edge Cases

- CI passa mas EasyPanel usa cache antigo: build sempre a partir do commit do
  merge, sem cache de camadas de source.
- Erro só aparece em `vite build` (não em `tsc`): CI já roda `npm run build`
  completo, cobrindo os dois.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A correção do bug (prop `onViewCalendar` em `PlanejadorPage.tsx`)
  DEVE ser commitada e `tsc -b` DEVE retornar exit 0.
- **FR-002**: O CI (`tsc -b && npm run build && npm run test:unit`) DEVE ser um
  **required status check** na branch `dev` (branch protection no GitHub).
- **FR-003**: Merge em `dev` DEVE ser bloqueado enquanto o CI não estiver verde.
- **FR-004**: A Constitution DEVE registrar o gate de build-antes-de-deploy como
  princípio não-negociável (ver amendment 1.1.0).
- **FR-005**: Todo bug de compilação/comportamento recorrente DEVE ter uma
  verificação que falha se o bug voltar — typecheck para erros de tipo, teste
  unitário de comportamento (TDD) para lógica.

### Key Entities

N/A — mudança de processo/CI, sem modelo de dados.

## Success Criteria *(mandatory)*

- **SC-001**: Zero deploys quebrados por erro de compilação após o gate ativo.
- **SC-002**: PR com erro de TS é 100% bloqueado antes do merge.
- **SC-003**: O CI roda em < 5 min para não travar o fluxo de merge.

## Assumptions

- O CI atual (`ci.yml`) já cobre os comandos certos; falta torná-lo obrigatório.
- Branch protection é configurável no repositório GitHub (`clickhero-dev/fury-app-v2`).
- EasyPanel deploya no push para `dev`; a garantia real vem de bloquear o
  merge, não o webhook do EasyPanel.
