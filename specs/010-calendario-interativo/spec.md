# Calendário Editorial — Especificação

## Contexto
<<<<<<< HEAD
A página `/calendario` já existe (`CalendarioPage.tsx` + `CalendarView.tsx`) e exibe posts do último plano gerado pelo planejador. O que falta é interatividade: selecionar múltiplos posts, programar publicação, desprogramar, excluir, drag-and-drop entre dias, navegação entre meses e publicação automática.
=======
A página `/calendario` (`CalendarioPage.tsx` + `CalendarView.tsx`) exibe posts do planejador e posts manuais em grid mensal. Suporta: navegação entre meses, seleção múltipla (click-to-select), agendamento/desprogramação/exclusão em lote, criação manual com upload de mídia, drag-and-drop entre dias, edição de post com IA via painel lateral e publicação automática (status only, sem integração real com plataformas).
>>>>>>> origin/hmg

## Requisitos Funcionais

### FR0 — Navegação entre meses
- Botões "<" e ">" para mês anterior/seguinte
- Exibe "Agosto 2026" no header
<<<<<<< HEAD
- Posts do mês selecionado carregados via API

### FR1 — Calendário mensal com posts de múltiplas origens
- Exibe posts do planejador (planos confirmados) E posts manuais no mesmo grid
- Backend: `GET /planner/calendar?month=YYYY-MM` retorna todos os posts do tenant no mês

### FR2 — Seleção múltipla de posts
- Checkbox em cada célula do dia que tem posts
- Checkbox "selecionar todos" no header do mês
- Contador de posts selecionados
- Click no post individual ainda abre o PostSidePanel

### FR3 — Agendar posts em lote
- Toolbar aparece quando há posts selecionados
- Botão "Agendar" abre modal com date/time picker
- Aplica `scheduledAt` em todos os posts selecionados
- Backend: `PATCH /planner/posts/bulk-schedule { postIds, scheduledAt }`

### FR4 — Desprogramar posts
- Botão "Desprogramar" na toolbar de seleção
- Remove `scheduledAt` dos posts selecionados

### FR5 — Excluir posts
- Botão "Excluir" na toolbar de seleção com confirmação
- Backend: `DELETE /planner/posts/bulk { postIds }` — soft delete (status = 'deleted')

### FR6 — Criar post manual
- Botão "+ Novo post" no header do calendário
- Modal: caption, tipo, dia do mês, plataforma
- Backend: `POST /planner/posts`

### FR7 — Drag-and-drop entre dias
- Arrastar post de um dia para outro no grid mensal
- HTML5 Drag and Drop nativo (sem lib)
- Backend: `PATCH /planner/posts/:id/move { dayIndex }` — atualiza o dia do post

### FR8 — Worker de publicação automática
- Endpoint: `POST /planner/posts/publish-due` — publica posts com `scheduledAt <= now()` e `status = 'scheduled'`
- Hermes cron chama esse endpoint a cada 5 minutos
- Publica via Instagram Graph API (já integrada) ou Meta API

## Requisitos Não-Funcionais
- Layout dark theme mantido
- PostSidePanel não conflita com seleção
- Navegação de mês preserva seleção

## Fora do Escopo (v1)
- Vista semanal ou diária
- Arrastar para semana específica (só entre dias do grid)
=======
- Posts do mês selecionado carregados via `GET /planner/calendar?year=&month=`
- Status: ✅ Implementado

### FR1 — Grid mensal multi-origem
- Posts do planejador (planos confirmados) + posts manuais no mesmo grid
- Posts exibem ícone do tipo, título/caption truncado, indicador de origem
- Máximo 3 posts visíveis por dia + contador "+N"
- Status: ✅ Implementado

### FR2 — Seleção múltipla (click-to-select, sem checkboxes)
- Clique em post não selecionado → adiciona à seleção
- Clique em post já selecionado → abre PostSidePanel
- Botão "Selecionar todos" / "Desmarcar todos" no header
- Contador de posts selecionados na toolbar
- Status: ✅ Implementado

### FR3 — Agendar posts em lote
- Toolbar condicional (surge com seleção ativa)
- Diálogo com date + time inputs separados
- Aplica `scheduledAt` em todos os posts selecionados
- Endpoint: `PATCH /planner/posts/bulk-schedule { postIds, scheduledAt }`
- Status: ✅ Implementado

### FR4 — Desprogramar posts
- Botão "Desprogramar" na toolbar (ação direta, sem diálogo)
- Remove `scheduledAt` (envia `null`)
- Status: ✅ Implementado

### FR5 — Excluir posts
- Botão "Excluir" com diálogo de confirmação
- Soft delete: `status = 'rejected'`
- Endpoint: `DELETE /planner/posts/bulk { postIds }`
- Status: ✅ Implementado

### FR6 — Criar post manual
- Botão "+ Novo post" no header
- Modal: upload de mídia (drag-and-drop ou clique, com preview), tipo (image/carousel/reel/stories), agendamento opcional, caption
- Campos pendentes: date+time separados no lugar de `datetime-local`
- Endpoints: `POST /planner/posts/upload` + `POST /planner/posts`
- Status: ✅ Implementado (com desvio: datetime-local no lugar de date+time)

### FR7 — Drag-and-drop entre dias
- HTML5 DnD nativo (sem lib)
- Feedback visual: célula destino com borda tracejada, post origem com opacidade
- Endpoint: `PATCH /planner/posts/:id/move { dayIndex }`
- Status: ✅ Implementado

### FR8 — Publicação automática no Instagram
- Endpoint: `POST /planner/posts/publish-due` — seleciona posts com `scheduledAt <= now()` e `status = 'approved'`
- Rota cron: `POST /planner/cron/publish-due` (sem auth, itera todos os tenants)
- Escopo v1: **apenas Instagram feed** — posts do tipo `image` (imagem única) e `reel` (vídeo único). Sem carousel, stories, ou Facebook.
- Fluxo Meta Graph API: resolver primeira página com Instagram do `selectedPageIds` → upload de mídia → criar media container → publicar (`/{ig-user-id}/media_publish`)
- **Retry strategy**: backoff exponencial (1min, 5min, 15min), máximo 3 tentativas. Após 3 falhas, status = `failed` com `lastPublishError`. Posts com `nextRetryAt <= now()` são reprocessados no próximo cron.
- Novos campos no modelo: `publishAttempts` (INT, default 0), `lastPublishError` (TEXT), `nextRetryAt` (TIMESTAMPTZ)
- **GAP**: atualmente só atualiza `status = 'published'`. Falta implementar o fluxo de publicação + retry.
- Status: ⚠️ Parcial (status-only, falta integração real e lógica de retry)

## Current Implementation

### Backend (`apps/api/src/`)

| Arquivo | O que faz |
|---------|----------|
| `routes/planner.routes.ts` | Rotas: calendar, bulk-schedule, bulk-delete, create post, move, publish-due, upload, cron |
| `controllers/planner.controller.ts` | Validação Zod, delegação para service |
| `services/planner.service.ts` | `getCalendarPosts` (planos + manuais por mês), `bulkSchedulePosts`, `bulkDeletePosts` (soft), `createManualPost`, `movePostDay`, `publishDuePosts` (status-only) |

### Frontend (`apps/web/src/pages/planejador/`)

| Arquivo | O que faz |
|---------|----------|
| `CalendarioPage.tsx` | Wrapper com AppLayout |
| `components/CalendarView.tsx` | Grid mensal, DnD, clique-to-select, toolbar, dialogs (CreatePost, Schedule, DeleteConfirm), toast, skeleton/error |
| `components/PostSidePanel.tsx` | Painel lateral: preview de mídia, edição manual, edição por IA com diff, copy-to-clipboard |
| `types.ts` | Post, Plan, AgentStep, JobStatus, ViewState |

### Gaps

| Gap | Onde | Descrição | FR |
|-----|------|-----------|-----|
| GAP-1 | `planner.service.ts:273-296` | `publishDuePosts` só atualiza status — falta implementar o fluxo Instagram Graph API (upload → media container → publish) | FR8 |
| GAP-2 | `CalendarView.tsx:607` | `CreatePostDialog` usa `datetime-local` em vez de inputs `type="date"` + `type="time"` separados | FR6 |

## Clarifications

### Session 2026-08-11
- Q: Escopo da publicação automática (FR8) — quais plataformas/formatos? → A: Apenas Instagram feed (image e vídeo único). Sem carousel, stories, ou Facebook.
- Q: Estratégia de retry para falhas de publicação? → A: Backoff exponencial (1min, 5min, 15min), máx 3 tentativas. Após 3 falhas, status = `failed`. Campos: `publishAttempts`, `lastPublishError`, `nextRetryAt`.
- Q: Código backend deve ser testável? → A: Sim. Services devem ser funções puras injetáveis, sem acoplamento a singletons ou estado global.
- Q: Como resolver qual conta Instagram publicar? → A: Primeira página com Instagram vinculado do `selectedPageIds` do tenant. Multi-account fica pra v2.

## Success Criteria
- Posts agendados são publicados no Instagram em até 2 minutos após `scheduledAt` (considerando intervalo de 5min do cron)
- Sistema processa 3 tentativas de retry com backoff antes de marcar como falha definitiva
- Tenant sem Instagram conectado é ignorado silenciosamente (sem erro ou alteração de status)
- `publishSinglePost` é testável isoladamente (recebe parâmetros, não acessa DB diretamente)

## Requisitos Não-Funcionais
- Layout dark theme mantido (Tailwind v4, CSS variables do FURY)
- Toast sempre no nível da página (fixed), nunca dentro de diálogo
- Toda mutation tem `onError` visível
- Sem libs externas de date picker — inputs HTML5 nativos
- Tenant isolation em todos os endpoints
- Backend testável: services como funções puras injetáveis, sem acoplamento a singletons ou estado global
- Novos endpoints do FR8 devem ter cobertura de testes unitários (service layer)

## Fora do Escopo (v1)
- Vista semanal ou diária
- Arrastar para semana específica
- Edição colaborativa em tempo real
- Suporte a múltiplos fusos horários
>>>>>>> origin/hmg
