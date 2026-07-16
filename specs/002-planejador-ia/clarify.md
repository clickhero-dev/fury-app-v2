# Clarify: Planejador IA — Reconciliação com implementação real

**Feature**: [spec.md](./spec.md) | **Date**: 2026-07-16

Perguntas de validação respondidas por inspeção do código (não hipóteses).

## Q1 — Essa tela está realmente funcional para o usuário?

**Não.** A geração está quebrada na raiz.

- `PlanejadorPage.tsx:19` → `api.post('/planner/generate', { tenantId: 'current' })`
- `planner.controller.ts:13` → `generateSchema = z.object({ tenantId: z.string().uuid() })`
- `'current'` não é UUID → Zod rejeita → HTTP 400 em toda geração.

**Root cause**: o controller lê `tenantId` do body em vez do contexto de tenant
autenticado (`req.tenant.tenantId`), como fazem os outros 3 endpoints do mesmo
controller (`getPlan`, `handleConfirm`, `handleRevalidate`).

## Q2 — Os dados estão sendo processados da maneira como deveriam?

**Parcial.** O pipeline dos 10 agentes roda e persiste corretamente, mas o
tracking de job é frágil.

- `orchestrator.ts:14` → `export const jobs = new Map<string, ...>()` em memória
  do processo.
- No EasyPanel, restart do container durante a geração perde o job → o polling
  do frontend fica órfão (job some, `GET /jobs/:id` retorna 404).
- Não escala horizontalmente: com 2+ instâncias, o polling pode bater numa
  instância que não tem o job.

## Q3 — Há algum bug ou má usabilidade nessa tela?

**Sim, 3 bugs:**

1. **tenantId** (Q1) — geração 100% quebrada.
2. **Rota `/calendario` órfã** — `CalendarioPage.tsx` existe e é completa, mas
   não está registrada em `router.tsx` (só `/planejador`) nem na `Sidebar.tsx`.
   O item "Calendário" da UI de referência não tem destino. Tela morta.
3. **`GET /planner/jobs/:jobId` sem isolamento de tenant** — em
   `planner.routes.ts:11` esse endpoint não tem `tenantMiddleware` nem valida
   ownership do job. Qualquer usuário autenticado lê o progresso de qualquer
   job. Viola Princípio I da Constitution (Multi-Tenant Isolation).

## Q4 — Isso está one-shot no frontend?

**Não literalmente.** É **one-click + polling assíncrono**, não resposta única.

- `POST /generate` retorna um `jobId`; o frontend faz polling em
  `GET /jobs/:jobId` a cada 1500ms (`PlanejadorPage.tsx:36-40`) até `done`.
- Correto para uma geração de 30-60s (uma request HTTP síncrona estouraria
  timeout). "One-shot" descreve a experiência do usuário (um clique), não o
  protocolo. Manter polling; ajustar a linguagem da spec.
