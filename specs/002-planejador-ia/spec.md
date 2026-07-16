# Feature Specification: Planejador IA — Calendário de Conteúdo One-Shot

**Feature Branch**: `feat/agent-planing-social`

**Created**: 2026-07-15

**Status**: Reconciliada com implementação (2026-07-16) — ver [clarify.md](./clarify.md)

**Input**: Geração de calendário de conteúdo mensal com um clique para pequenos negócios locais, onde a IA executa todo o planejamento internamente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Geração One-Shot do Calendário (Priority: P1 🎯 MVP)

O dono de uma clínica/restaurante/academia acessa o Planejador, vê um resumo das configurações da empresa (Instagram conectado ✓, Facebook conectado ✓, etc.) e clica em um único botão "Gerar planejamento". A IA analisa a empresa, pesquisa tendências e datas comemorativas, e gera um mês completo de conteúdo.

**Why this priority**: O conceito One-Shot é o core da feature. Sem isso, não há Planejador.

**Independent Test**: Um usuário com todas as configurações preenchidas consegue gerar um calendário mensal completo com um único clique, em menos de 60 segundos.

**Acceptance Scenarios**:
1. **Given** o usuário acessa o Planejador, **When** a página carrega, **Then** exibe resumo das configurações (empresa, Instagram, Facebook, produtos, objetivo, tom de voz) com checks verdes.
2. **Given** tudo configurado, **When** o usuário clica em "Gerar planejamento", **Then** a tela de progresso da IA é exibida com 12 passos animados.
3. **Given** a IA concluiu o planejamento, **When** o progresso atinge 100%, **Then** exibe o resumo do plano (N conteúdos, Reels, Carrosséis, Posts, Stories).

---

### User Story 2 — Visualização em Calendário (Priority: P1 🎯 MVP)

Após a geração, o usuário vê o calendário mensal com cada conteúdo como um card (ícone + tipo + título + status). Pode arrastar e soltar para reorganizar. Cores discretas diferenciam Reels, Carrosséis, Stories e Imagens.

**Why this priority**: O calendário é a interface principal de revisão. Sem ele, o usuário não consegue visualizar o plano.

**Independent Test**: Um usuário consegue ver todos os conteúdos do mês organizados em grid, identificar o tipo de cada um pela cor, e arrastar um card para outra data.

**Acceptance Scenarios**:
1. **Given** o plano foi gerado, **When** o usuário clica "Ver calendário", **Then** exibe grid mensal com cards de conteúdo.
2. **Given** o calendário está visível, **When** o usuário arrasta um card, **Then** a data do conteúdo é atualizada.
3. **Given** um card está no calendário, **Then** ele mostra ícone, tipo, título e status.

---

### User Story 3 — Edição com IA via Chat (Priority: P2)

Ao clicar em um conteúdo, abre um painel lateral com preview completo (legenda, CTA, hashtags, imagem). O usuário pode editar manualmente ou usar o chat IA para transformar o conteúdo: "Torne mais engraçado", "Faça para Facebook", "Adicione uma promoção".

**Why this priority**: A edição IA é o diferencial, mas o MVP pode funcionar com edição manual básica.

**Independent Test**: Um usuário consegue alterar o tom de um post usando linguagem natural no chat.

**Acceptance Scenarios**:
1. **Given** um card no calendário, **When** o usuário clica nele, **Then** abre painel lateral com preview e metadados.
2. **Given** o painel está aberto, **When** o usuário digita "Torne mais engraçado" no chat, **Then** a IA regenera o conteúdo com tom engraçado.

---

### User Story 4 — Aprovação e Agendamento (Priority: P2)

Na tela de aprovação, o usuário vê um resumo (ex: "16 conteúdos, 8 Reels, 4 Carrosséis, 4 Posts, 31 Stories") e clica "Agendar tudo". Após o agendamento, a IA continua monitorando e exibe recomendações automáticas.

**Why this priority**: O agendamento fecha o ciclo, mas o MVP pode focar na geração e visualização primeiro.

**Independent Test**: Um usuário consegue agendar todo o mês com um clique.

**Acceptance Scenarios**:
1. **Given** o calendário está revisado, **When** o usuário clica "Agendar tudo", **Then** os posts são agendados na plataforma.
2. **Given** os posts foram agendados, **When** a IA detecta uma oportunidade (ex: Dia dos Pais), **Then** exibe recomendação com "Adicionar automaticamente?".

---

### Edge Cases

- Usuário sem Instagram conectado: checklist mostra pendência, botão desabilitado com tooltip.
- Geração falha por erro de IA: tela de erro amigável com botão "Tentar novamente".
- Usuário tenta gerar sem dados da empresa: redireciona para Configurações.
- Sessão expira durante geração: retoma do último checkpoint salvo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE exibir checklist de pré-requisitos (Instagram, Facebook, produtos, objetivo, tom de voz).
- **FR-002**: Sistema DEVE gerar calendário mensal com um clique, sem formulários intermediários.
- **FR-003**: Sistema DEVE exibir progresso da IA com 12 passos animados durante a geração.
- **FR-004**: Sistema DEVE exibir resumo do plano (contagem por tipo de conteúdo + objetivo + período).
- **FR-005**: Sistema DEVE exibir calendário em grid com cards de conteúdo (ícone, tipo, título, status).
- **FR-006**: Sistema DEVE permitir drag-and-drop para reorganizar conteúdos no calendário.
- **FR-007**: Sistema DEVE abrir painel lateral ao clicar em um conteúdo, sem trocar de página.
- **FR-008**: Sistema DEVE permitir edição de conteúdo via chat IA com linguagem natural.
- **FR-009**: Sistema DEVE permitir aprovação e agendamento em massa com um clique.
- **FR-010**: Sistema DEVE exibir recomendações automáticas pós-agendamento.

### Key Entities

- **CampaignPlan**: Plano mensal gerado pela IA. Contém tenant_id, mês/ano, objetivo, status (draft, active, completed, cancelled), metadata (summary por tipo de conteúdo).
- **SocialPost**: Post individual dentro de um plano. Contém tipo (reel/carousel/image/stories), título, legenda, CTA, hashtags, prompt_imagem, data_agendada, status (draft/approved/scheduled/published).
- **PlannerJob**: Job de geração (in-memory Map no processo). Contém id, status (pending/running/generating/done/error), currentAgent, agentProgress[], planId.
- **Pipeline de 10 Agentes** (`apps/api/src/agents/`): sequência que produz o plano — Context → Research → Analytics → Strategy → Planner → Copywriter → Creative → Quality (com até 2 retries) → Scheduler → Branding (gate de compliance). Cada agente consome o output do anterior; falha de qualidade ou compliance aborta o job com mensagem amigável.

### Bugs conhecidos (reconciliação 2026-07-16)

- **BUG-001** (P1): `POST /planner/generate` recebe `tenantId: 'current'` do frontend mas valida UUID → 400 sempre. Geração 100% quebrada. Fix: controller usa `req.tenant.tenantId`.
- **BUG-002** (P1): rota `/calendario` não registrada — `CalendarioPage.tsx` órfã. Fix: registrar em router + Sidebar.
- **BUG-003** (P1): `GET /planner/jobs/:jobId` sem tenant isolation. Fix: escopar job por tenant.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Usuário gera calendário completo em < 60 segundos.
- **SC-002**: 80% dos usuários aprovam o calendário gerado sem edições manuais.
- **SC-003**: Usuário completa o fluxo (gerar → revisar → agendar) em < 3 minutos.
- **SC-004**: NPS ≥ 50 na pergunta "Recomendaria o Planejador IA para outro negócio?".

## Assumptions

- O usuário já configurou a empresa (branding, redes sociais, tom de voz) nas Configurações.
- O Instagram e Facebook estão previamente conectados via OAuth.
- O serviço OpenRouter/DeepSeek existente será usado para geração dos conteúdos.
- A interface segue o design system existente (cores, tipografia, componentes).
