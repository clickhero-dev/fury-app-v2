# Tasks: Planejador IA — Reconciliação + fix dos 3 bugs

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Clarify**: [clarify.md](./clarify.md)

Escopo: só o que falta. O pipeline de 10 agentes e as telas já existem e rodam.
Estas tasks fecham os 3 bugs da reconciliação. TDD onde há lógica (Constitution VI/III).

## T001 — [BUG-001 P1] Geração quebrada: tenantId

- **Arquivo**: `apps/api/src/controllers/planner.controller.ts`
- Trocar `generatePlan` para ler `req.tenant!.tenantId` (como `getPlan`/`handleConfirm`), remover `generateSchema`/parse do body.
- **Arquivo**: `apps/api/src/routes/planner.routes.ts` — garantir `tenantMiddleware` em `/generate` (já tem).
- **Arquivo**: `apps/web/src/pages/planejador/PlanejadorPage.tsx:19` — remover `{ tenantId: 'current' }`, `POST /planner/generate` sem body.
- **Verificação**: `tsc -b` + teste T004.

## T002 — [BUG-002 P1] Rota /calendario órfã

- **Arquivo**: `apps/web/src/router.tsx` — importar `CalendarioPage`, registrar `{ path: '/calendario', element: <CalendarioPage /> }`.
- **Arquivo**: `apps/web/src/components/Sidebar.tsx` — adicionar item "Calendário" (path `/calendario`) após "Planejador IA".
- **Verificação**: `tsc -b`, navegar `/calendario` renderiza.

## T003 — [BUG-003 P1] Job sem tenant isolation

- **Arquivo**: `apps/api/src/agents/orchestrator.ts` — job carrega `tenantId`.
- **Arquivo**: `apps/api/src/routes/planner.routes.ts:11` — adicionar `tenantMiddleware` em `GET /jobs/:jobId`.
- **Arquivo**: `apps/api/src/controllers/planner.controller.ts` — `getJob` rejeita (404) se `job.tenantId !== req.tenant.tenantId`.
- **Verificação**: teste T004.

## T004 — [TDD] Teste de regressão dos bugs

- **Arquivo novo**: `apps/api/src/__tests__/planner-controller.test.ts`
- Casos (comportamento esperado, falham antes do fix):
  1. `generatePlan` usa tenant do contexto, não do body — não retorna 400.
  2. `getJob` de outro tenant → 404 (isolamento).
- Sem framework novo — vitest já configurado. Segue padrão de `campaigns-service.test.ts`.

## Ordem

T001 → T003 → T004 (backend, mesma área) · T002 independente (frontend).
