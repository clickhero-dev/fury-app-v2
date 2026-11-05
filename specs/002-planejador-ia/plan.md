# Implementation Plan: Planejador IA — Calendário de Conteúdo One-Shot

**Branch**: `feat/agent-planing-social` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-planejador-ia/spec.md`

## Summary

Gerar calendário de conteúdo mensal com um clique para pequenos negócios locais. A IA executa todo o planejamento (entender empresa, pesquisar tendências, criar estratégia, distribuir formatos, escrever legendas, gerar prompts de imagem) sem intervenção do usuário. Interface com 7 telas: status → progresso → resumo → calendário → painel lateral → editor IA → aprovação.

**Abordagem**: Reutilizar infraestrutura existente (OpenRouter/DeepSeek para LLM, Postgres + Drizzle para persistência, React + Vite + Tailwind para frontend). O planejamento roda como **pipeline sequencial de 10 agentes** (`apps/api/src/agents/`), orquestrado em `orchestrator.ts` — sem LangGraph (o grafo é linear, orquestração à mão em TS basta). Job tracking via Map em memória do processo (ver Complexity Tracking para o teto). Stories entram como sugestão no resumo de aprovação (não geram posts individuais no MVP).

## Technical Context

**Language/Version**: TypeScript 5.x (backend + frontend)

**Primary Dependencies**: Express.js (backend), React 18 + Vite (frontend), Drizzle ORM (DB), OpenRouter/DeepSeek (LLM), zod (validação)

**Storage**: PostgreSQL 16 via Neon (prod) / Docker (dev)

**Testing**: Vitest (backend — 22 suites existentes), sem testes de frontend no MVP

**Target Platform**: Web (desktop + mobile responsive)

**Project Type**: Monorepo web application (apps/api + apps/web + packages/db)

**Performance Goals**: Geração do plano em < 60 segundos. Polling de progresso a cada 1.5s. Primeira exibição do calendário em < 200ms após geração.

**Constraints**: Tema escuro da plataforma (consistente com o design system existente). Sem WebSocket/SSE — usar polling.

**Scale/Scope**: Dezenas de tenants (empresas locais), cada um com 1 plano mensal de 15-30 posts. Jobs de geração serializados por tenant.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Rationale |
|------|--------|-----------|
| I. Multi-Tenant Isolation | ✅ PASS | Todos os queries escopam por tenant_id via middleware de tenant. RLS já habilitado nas tabelas existentes e aplicado nas novas. |
| II. API Contracts & Validation | ✅ PASS | Zod schemas nos endpoints POST /api/planner/generate, GET /api/planner/jobs/:id, GET /api/planner/plans/:id, PATCH /api/planner/posts/:id. Responses seguem ApiResponse<T>. |
| III. Test-First Quality Gates | ⚠️ VIOLATION (justified) | Testes adiados para pós-MVP. Feature é experimental e o ciclo de feedback do usuário é mais urgente. Cobertura será adicionada em PR separado. |
| IV. AI Integration Discipline | ✅ PASS | Prompts estruturados com formato de saída explícito (response_format: json_object). Validação do output da IA antes de persistir. Fallback com mensagem de erro amigável. |
| V. Simplicity & YAGNI | ✅ PASS | Zero dependências novas além das já existentes. Pipeline linear (sem LangGraph). Sem WebSocket. Sem Redis adicional. |

## Project Structure

### Documentation (this feature)

```text
specs/002-planejador-ia/
├── spec.md              # Feature specification
├── plan.md              # Implementation plan (/speckit-plan output)
├── clarify.md           # Validação de resiliência e inputs (2026-07-16)
├── tasks.md             # Tasks de implementação
└── research.md          # Phase 0 output (pesquisa inicial)
```

### Source Code (repository root)

```text
packages/db/
├── src/schema.ts             # + campaignPlans, socialPosts tables
└── migrations/               # + 0023_planner_tables.sql, 0024_add_reel_post_type.sql

apps/api/
├── src/routes/planner.routes.ts       # 6 endpoints (POST generate, GET jobs, GET plans, POST confirm, POST revalidate, PATCH posts)
├── src/controllers/planner.controller.ts
├── src/services/planner.service.ts    # Pipeline orchestrator + AI edit
├── src/agents/                       # 10 agentes (orchestrator.ts + 9 agent .ts + save.service.ts)
└── src/__tests__/planner-controller.test.ts  # Regressão: tenantId + job isolation

apps/web/
├── src/pages/planejador/
│   ├── PlanejadorPage.tsx             # State machine (2 views: idle/generating)
│   ├── CalendarioPage.tsx             # Página dedicada do calendário
│   └── components/
│       ├── IdleStatus.tsx             # Tela 1: checklist + botão gerar
│       ├── GeneratingState.tsx        # Tela 2: progresso 10 agentes
│       ├── PlanSummary.tsx            # Tela 3: resumo do plano
│       ├── CalendarView.tsx           # Tela 4: calendário grid
│       └── PostSidePanel.tsx          # Tela 5+6: painel lateral + editor IA
├── src/router.tsx                     # + /planejador, /calendario
└── src/components/Sidebar.tsx         # + nav items: Planejador IA, Calendário
```

**Structure Decision**: Monorepo com 3 pacotes. Nova feature adiciona ~15 source files + 2 migrations (0023, 0024) + testes (planner-controller, parse-json).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| III. Test-First | MVP velocity — feedback de usuário > cobertura de testes | Testes unitários do service podem ser adicionados depois sem quebrar contrato |
| Job tracking em Map de memória | Simplicidade — evita BullMQ/Redis pra um job por tenant | **ponytail: teto conhecido** — perde job em restart do container e não escala p/ múltiplas instâncias. Upgrade path: mover para tabela `planner_jobs` no Postgres quando escala exigir. Aceitável enquanto EasyPanel roda 1 instância. |
| Checklist decorativo (FR-001) | Velocidade de MVP — checklist exibia tudo verde sem consultar DB | **corrigido**: agora `GET /planner/prerequisites` consulta meta_connections, clientGoals, brandKits em tempo real (2026-07-16) |

## Known Gaps

### Spec vs Code (reconciliação 2026-07-16)

| Gap | O que o spec diz | Realidade |
|-----|-----------------|-----------|
| US1 — após geração | "exibe resumo do plano" | `PlanejadorPage` redireciona para `/calendario`. PlanSummary não é mais exibido. |
| US2 — drag-and-drop | "arrasta card, data é atualizada" | FR-006 🚫 NÃO IMPLEMENTADO. Calendário é somente visual. |
| US4 — "Agendar tudo" | "posts agendados na plataforma" | FR-009 🚫 NÃO IMPLEMENTADO. `confirmPlan` só muda status no DB. |
| US4 — recomendações IA | "IA detecta oportunidade" | FR-010 🚫 NÃO IMPLEMENTADO. Nenhum monitoramento pós-agendamento. |
| Sessão expira | "retoma do último checkpoint" | localStorage salva jobId apenas. Se servidor reiniciar, job é perdido. |
| PlanSummary | faz parte do fluxo de 7 telas | Componente existe mas nunca é renderizado. Órfão desde a troca para redirect. |

## Bug Fix: critério de "Meta conectada" no Planejador (2026-07-16)

**Sintoma (ticket)**: conta conectada na Meta não aparece como conectada no Planejador IA, embora campanhas publiquem normalmente (outros dados do cliente OK).

**Raiz** (`apps/api/src/services/planner.service.ts:60-79`): `getPrerequisites` define
`metaConnected = !!meta` onde `meta` = linha em `meta_connections` com `tokenExpiresAt > now`.
Não exige página selecionada. O critério real de "capaz de enviar postagens IG/FB via API"
(usado em `campaigns.service.ts:657-659`) é **token válido + `selectedPageIds` não-vazio**.
Ad account é só pra ads → fora do critério.

**Fix (raiz, uma linha de lógica)**: `getPrerequisites` retorna
`metaConnected = tokenExpiresAt > now AND selectedPageIds != '[]'::jsonb`.
Frontend (`PlanejadorPage.tsx:53-60`) e `IdleStatus` já consomem `pre.metaConnected` corretamente —
não precisam mudar. `tenantMiddleware` resolve tenantId certo.

**Teste de regressão (Constituição III)**: `apps/api/src/__tests__/planner-prerequisites.test.ts`
— tenant com token válido + `selectedPageIds: ['page_1']` → `metaConnected: true`;
tenant com token válido + `selectedPageIds: []` → `metaConnected: false`. Teste falha antes do fix, passa depois.

**Constitution Check adicional**:
- III. Test-First ✅ — teste de regressão obrigatório (bug recorrente de critério).
- V. Simplicity ✅ — one-line no service existente, zero novos arquivos além do teste.
