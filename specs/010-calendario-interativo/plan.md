# Plano — Calendário Editorial Interativo

## Fase 1: Backend (API)
**Arquivos:** `apps/api/src/routes/planner.routes.ts`, `apps/api/src/controllers/planner.controller.ts`, `apps/api/src/services/planner.service.ts`

### 1.1 — Endpoint GET /planner/calendar
- Query param: `month` (YYYY-MM), default mês atual
- Retorna todos os posts do tenant no mês (planos + manuais)
- Response: `{ posts: Post[], month: string }`

### 1.2 — Endpoint PATCH /planner/posts/bulk-schedule
- Body: `{ postIds: string[], scheduledAt: string }`
- Valida que todos os posts pertencem ao tenant
- Atualiza `scheduledAt` em batch

### 1.3 — Endpoint DELETE /planner/posts/bulk
- Body: `{ postIds: string[] }`
- Soft delete: seta `status = 'deleted'`
- Valida tenant ownership

### 1.4 — Endpoint POST /planner/posts
- Body: `{ caption, postType, dayIndex, platform, scheduledAt?, title? }`
- Cria post manual (planId = null, source = 'manual')
- Valida postType ∈ ['image','carousel','reel','stories']

## Fase 2: Frontend — Seleção múltipla
**Arquivos:** `CalendarView.tsx`, `CalendarioPage.tsx`

### 2.1 — Selection state
- `Set<string>` de postIds selecionados
- Checkbox por dia (seleciona todos os posts daquele dia)
- Checkbox "selecionar todos" no header

### 2.2 — Selection toolbar
- Condicional: só aparece com `selectedIds.size > 0`
- Mostra contagem: "3 posts selecionados"
- Botões: Agendar, Desprogramar, Excluir

### 2.3 — Integração com PostSidePanel
- Click individual abre PostSidePanel (sem afetar seleção)
- Checkbox não conflita com click — checkbox é área separada no canto da célula

## Fase 3: Frontend — Diálogos de ação
**Arquivos:** `ScheduleDialog.tsx`, `DeleteConfirmDialog.tsx` (novos em `components/`)

### 3.1 — ScheduleDialog
- DateTime picker (input type="datetime-local" nativo)
- Confirmação: "Agendar X posts para [data/hora]"
- Mutação: `PATCH /planner/posts/bulk-schedule`
- On success: limpa seleção, refetch calendário

### 3.2 — DeleteConfirmDialog
- "Tem certeza que deseja excluir X posts?"
- Mutação: `DELETE /planner/posts/bulk`
- On success: limpa seleção, refetch

### 3.3 — Unschedule (sem diálogo, ação direta)
- Mutação: `PATCH /planner/posts/bulk-schedule` com `scheduledAt: null`

## Fase 4: Frontend — Criar post manual
**Arquivos:** `CreatePostDialog.tsx` (novo)

### 4.1 — Botão "+ Novo post"
- No header do CalendarioPage, ao lado do título

### 4.2 — Modal de criação
- Campos: caption (textarea), tipo (select: image/carousel/reel/stories), dia do mês (number), plataforma (select)
- Data/hora agendada opcional (datetime-local)
- Mutação: `POST /planner/posts`
- On success: fecha modal, refetch

## Fase 5: Integração e polimento
### 5.1 — Refetch após mutações
- `queryClient.invalidateQueries({ queryKey: ['calendar'] })`

### 5.2 — Testes
- Testes unitários dos endpoints novos
- Teste do CalendarView com seleção múltipla

## Pontos de atenção
- `ponytail`: usa `input type="date"` e `input type="datetime-local"` nativos (sem lib de date picker)
- `ponytail`: `Set<string>` para seleção (já na stdlib)
- Tenant isolation: todos os endpoints validam `req.tenant.tenantId`
- Migrations: adicionar coluna `source` (manual/planner) e permitir `plan_id` null se precisar (verificar schema atual)
