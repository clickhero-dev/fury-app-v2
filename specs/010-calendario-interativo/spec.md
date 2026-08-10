# Calendário Editorial — Especificação

## Contexto
A página `/calendario` já existe (`CalendarioPage.tsx` + `CalendarView.tsx`) e exibe posts do último plano gerado pelo planejador. O que falta é interatividade: selecionar múltiplos posts, programar publicação, desprogramar, excluir, drag-and-drop entre dias, navegação entre meses e publicação automática.

## Requisitos Funcionais

### FR0 — Navegação entre meses
- Botões "<" e ">" para mês anterior/seguinte
- Exibe "Agosto 2026" no header
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
