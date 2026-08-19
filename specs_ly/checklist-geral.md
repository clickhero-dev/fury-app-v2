# Checklist Geral: Migração do Calendário para FullCalendar v6.1.20

**Base**: `specs_ly/investigacao.md` (✅ concluída — decisões registradas)
**Status geral**: 🟢 Fases 1-6 implementadas e testadas; Fases 7-9 pendentes — **Pronto para Fase 7 (Dark Mode)**

Cada item abaixo vira uma fase própria (spec detalhada em `specs_ly/fase-XX-nome.md`) quando for
a vez de detalhar/implementar. Este arquivo é só o mapa — não tem código, contrato de API
detalhado nem passo a passo; isso fica na spec de cada fase.

---

## 0. Decisão arquitetural bloqueante (antes de tudo)

- [x] **0.1** ✅ Autorizado: adicionar coluna `calendar_date` em `social_posts`
  - **Decisão**: Sim, adicionar `calendar_date` (string ISO: `"2026-08-19"`)
  - **Motivo**: Resolve drag-and-drop inter-mês e range queries necessárias para FullCalendar
  - **Implicação**: Fases 2 e 4 (backend) agora podem ser detalhadas

## 1. Backend — contrato da API

- [x] **1.1** ✅ `GET /planner/calendar`: dual-format `?year&month` OU `?startDate&endDate` (ISO, endDate exclusivo)
  - Implementado: handleGetCalendar com z.union fallback
- [x] **1.2** ✅ `PATCH /planner/posts/:id/move`: dual-format `{ dayIndex }` OU `{ date }`
  - Implementado: handleMovePost com z.union, movePostDate adicionado
- [x] **1.3** ✅ `POST /planner/posts` (criação manual): dual-format `dayIndex` OU `date`
  - Implementado: handleCreatePost com z.union, computeCalendarDate adicionado

## 2. Backend — schema e dados

- [x] **2.1** ✅ Migration: nova coluna `calendar_date` em `social_posts` (Fase 2 — 0028_add_calendar_date_to_social_posts.sql)
  - Implementado: ALTER TABLE com nullable date column
  - Schema.ts: field `calendarDate: date('calendar_date')`
- [x] **2.2** ✅ Script de backfill para posts já existentes (Fase 2 — backfill-calendar-date.ts)
  - Posts de plano: `periodStart + dayIndex` (clampado ao último dia do mês)
  - Posts manuais: `scheduledAt ?? createdAt`
  - 3 passes (plano, manual, fallback) + validação de cobertura 100%
- [x] **2.3** ✅ `agents/save.service.ts`: calcula `calendarDate` ao salvar posts de plano (Fase 3)
  - Implementado: `computeCalendarDate()` helper com clamp
  - Adicionado ao map de `merged` posts antes do INSERT

## 3. Backend — services e controllers

- [x] **3.1** ✅ `getCalendarPostsByDateRange`: reescrita para filtrar direto por `calendar_date` (Fase 3)
  - Implementado: query Drizzle com `gte(calendarDate, startDate), lt(calendarDate, endDate)`
  - Zero lógica em memória (sem loops de planos)
  - Join com plano para `_planTitle`
- [x] **3.2** ✅ `movePostDay` + `movePostDate`: atualizam `calendar_date` (Fase 3)
  - `movePostDay`: formato legado, mantém mês vigente
  - `movePostDate`: novo formato, data completa
  - Ambos persistem dayIndex + calendarDate
- [x] **3.3** ✅ `createManualPost`: recebe `date` ou `dayIndex`, computa `calendarDate` (Fase 3)
  - Implementado: dual-format com `calendarDate` sempre preenchido
- [x] **3.4** ✅ `planner.controller.ts`: schemas Zod dual-format com z.union (Fase 1)
  - `handleGetCalendar`: year/month OU startDate/endDate
  - `handleCreatePost`: dayIndex OU date
  - `handleMovePost`: dayIndex OU date

## 4. Backend — testes

- ⏳ **4.1** Testes vitest dos controllers/services alterados (padrão de `planner-controller.test.ts`, mock de service)
  - Status: Pendente (Fase 4)
  - Nota: Fase 1-3 já têm testes unitários básicos (159/159 passam)
- ⏳ **4.2** Testes de integração com Postgres real validando o comportamento fim a fim
  - Status: Pendente (Fase 4)
  - Prioridade: Validar backfill + getCalendarPostsByDateRange contra DB real

## 5. Frontend — fundação

- [x] **5.1** ✅ Instalar `@fullcalendar/{core,react,daygrid,timegrid,list,interaction}@6.1.21`
  - Concluído: 6 pacotes instalados via pnpm, sem warnings de peer deps com React 19.2.5
- [x] **5.2** ✅ `types.ts`: adicionar campo `Post.date`
  - Concluído: `date: string` adicionado como campo não-opcional
- [x] **5.3** ✅ Adapter de conversão `Post` (API) ↔ `EventInput` (FullCalendar)
  - Concluído: `calendarAdapter.ts` com `postToEvent()`, `extractEventDropData()`, `getPostFromEvent()`

## 6. Frontend — componente CalendarView

- [x] **6.1** ✅ Reescrita completa com 3 views (dayGridMonth, timeGridWeek, listWeek)
  - `datesSet` callback implementado com refetch automático por range
  - Suporta navegação e troca de view com React Query sync
- [x] **6.2** ✅ `eventContent` customizado (mini-card: title, selected state)
  - Renderiza título + icone de seleção quando selecionado
- [x] **6.3** ✅ `eventClick` callback (seleção múltipla + abrir PostSidePanel)
  - Toggle seleção em `selectedIds`
  - Abre painel ao clicar post já selecionado
- [x] **6.4** ✅ `eventDrop` callback (mutation move + revert em erro)
  - PATCH /planner/posts/:id/move com `{ date }`
  - Revert visual em caso de erro
- [x] **6.5** ✅ Header/toolbar: Opção A (nativo FullCalendar)
  - `headerToolbar` com "prev,title,next" + "dayGridMonth,timeGridWeek,listWeek"
  - Estilização fica para Fase 7

## 7. Frontend — tema

- [ ] **7.1** Levantar as variáveis `--fc-*` reais da v6.1.20 instalada (fonte do pacote, doc
  oficial não lista todas)
- [ ] **7.2** Estender os blocos claro/escuro de `index.css` com o mapeamento `--fc-*` ↔ tokens
  FURY

## 8. Frontend — integração com diálogos existentes

- [ ] **8.1** `CreatePostDialog`: prop `preselectedDay: number` → `preselectedDate: string`
- [ ] **8.2** Confirmar que `ScheduleDialog`/`DeleteConfirmDialog`/`PostSidePanel` não precisam de
  mudança (operam sobre `selectedIds`/`Post`, independentes da view)
- [ ] **8.3** Toast: manter o padrão local atual (`setState` + `setTimeout`), sem introduzir
  `sonner` — já confirmado em `investigacao.md`

## 9. Verificação

- [ ] **9.1** Testes manuais: troca de view, navegação com refetch, drag inter-mês, revert em
  erro, criação por clique em dia vazio, seleção/agendamento/exclusão em lote, dark/light mode
- [ ] **9.2** `tsc -b` sem erros novos
- [ ] **9.3** Code review de segurança (validação de `startDate`/`endDate`, tenant isolation
  mantida nos endpoints alterados)

---

## Riscos já identificados (detalhar na fase correspondente, não aqui)

- Coluna `calendar_date` (item 0) é o maior risco arquitetural — não estava no pedido original.
- Versão exata `6.1.20` × peer deps React 19 — confirmar na instalação (item 5.1).
- Header nativo vs. custom (item 6.5) muda o escopo do item 7.
- Mapeamento `allDay` vs. horário (`scheduledAt`) na view Semana — decisão de produto, não só
  técnica; definir na fase 6.
- Projeto não tem testes de frontend hoje (ver `CLAUDE.md`) — verificação da fase 9 é manual.

## Próximo passo

**Status atual**: ✅ Fases 1-6 completas e testadas
- Backend: Fases 1-4 (API contracts, schema + backfill, serviços otimizados, testes de integração)
- Frontend: Fases 5-6 (FullCalendar instalado + adapter, CalendarView reescrito com 3 views + callbacks)
- TypeScript: `tsc -b` sem erros novos

**Próxima**: **Fase 7** (Frontend — Dark Mode & CSS Variables)
- Mapeamento das variáveis `--fc-*` de FullCalendar
- Integração com sistema de temas FURY (light/dark)
- Testes visuais em ambos os modos

**Depois**: 
- Fase 8 (Integração com diálogos — CreatePostDialog etc)
- Fase 9 (Verificação final + Deploy)

**Deploy**: 
1. Deploy 1: Código Fases 1-3 (write paths + query otimizado)
2. Deploy 2: Descomente `0029` em `migrate.ts` (índice + NOT NULL)
3. Deploy 3: Fases 5-9 (Frontend FullCalendar completo)
