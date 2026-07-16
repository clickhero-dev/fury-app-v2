# Feature Specification: Planejador IA — Calendário de Conteúdo One-Shot

**Feature Branch**: `feat/agent-planing-social`

**Created**: 2026-07-15

**Status**: Reconciliada com implementação (2026-07-16) — ver [clarify.md](./clarify.md)

**Input**: Geração de calendário de conteúdo mensal com um clique para pequenos negócios locais, onde a IA executa todo o planejamento internamente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Geração One-Shot do Calendário (Priority: P1 🎯 MVP)

O dono de uma clínica/restaurante/academia acessa o Planejador, vê um resumo das configurações da empresa (Meta conectada ✓, produtos ✓, objetivo ✓, tom de voz ✓) e clica em um único botão "Gerar planejamento". A IA analisa a empresa, pesquisa tendências e datas comemorativas, e gera um mês completo de conteúdo.

**Why this priority**: O conceito One-Shot é o core da feature. Sem isso, não há Planejador.

**Independent Test**: Um usuário com todas as configurações preenchidas consegue gerar um calendário mensal completo com um único clique, em menos de 60 segundos.

**Acceptance Scenarios**:
1. **Given** o usuário acessa o Planejador, **When** a página carrega, **Then** exibe checklist dinâmico com status real (conexão Meta, produto, objetivo, tom de voz).
2. **Given** tudo configurado, **When** o usuário clica em "Gerar planejamento", **Then** a tela de progresso da IA é exibida com 10 passos dos agentes.
3. **Given** a IA concluiu o planejamento, **When** o progresso atinge 100%, **Then** o usuário é redirecionado automaticamente para o Calendário Editorial com o plano carregado.

---

### User Story 2 — Visualização em Calendário (Priority: P1 🎯 MVP)

Após a geração, o usuário vê o calendário mensal com cada conteúdo como um card (ícone + tipo + título + status). Cores discretas diferenciam Reels, Carrosséis, Stories e Imagens. *(Drag-and-drop não implementado no MVP — FR-006 🚫)*

**Why this priority**: O calendário é a interface principal de revisão.

**Independent Test**: Um usuário consegue ver todos os conteúdos do mês organizados em grid e identificar o tipo de cada um pela cor.

**Acceptance Scenarios**:
1. **Given** o plano foi gerado, **When** o calendário carrega, **Then** exibe grid mensal com cards de conteúdo.
2. **Given** um card está no calendário, **Then** ele mostra ícone, tipo, título e status.

---

### User Story 3 — Edição com IA via Chat (Priority: P2)

Ao clicar em um conteúdo, abre um painel lateral com preview completo (legenda, CTA, hashtags, imagem). O usuário pode editar manualmente ou usar o chat IA para transformar o conteúdo: "Torne mais engraçado", "Faça para Facebook", "Adicione uma promoção". A IA regenera o conteúdo via OpenRouter.

**Why this priority**: A edição IA é o diferencial, mas o MVP pode funcionar com edição manual básica.

**Independent Test**: Um usuário consegue alterar o tom de um post usando linguagem natural no chat.

**Acceptance Scenarios**:
1. **Given** um card no calendário, **When** o usuário clica nele, **Then** abre painel lateral com preview e metadados.
2. **Given** o painel está aberto, **When** o usuário digita "Torne mais engraçado" no chat, **Then** a IA regenera o conteúdo com tom engraçado (chamada OpenRouter).

---

### User Story 4 — Aprovação e Agendamento (Priority: P2)

Na tela de aprovação do calendário, o usuário vê um resumo (ex: "16 conteúdos, 8 Reels, 4 Carrosséis, 4 Posts, 31 Stories") e clica "Confirmar". *(Agendamento real em plataforma Meta 🚫 NÃO IMPLEMENTADO — FR-009)*

**Why this priority**: O agendamento fecha o ciclo, mas o MVP foca na geração e visualização primeiro.

**Independent Test**: Um usuário consegue confirmar e aprovar o plano gerado com um clique.

**Acceptance Scenarios**:
1. **Given** o calendário está revisado, **When** o usuário clica "Confirmar e Agendar", **Then** o plano muda para status ativo no banco.
2. 🚫 *Recomendações automáticas pós-agendamento não implementadas (FR-010).*

---

### Edge Cases

- Usuário sem Meta conectado ou sem produto/objetivo/tom de voz: checklist dinâmico mostra pendência, botão "Gerar" desabilitado com tooltip, mensagem "Preencha os requisitos pendentes".
- Geração falha por erro de IA: tela de erro amigável com botão "Tentar novamente".
- Usuário tenta gerar sem dados da empresa: redireciona para Configurações (futuro — atualmente checklist orienta).
- Sessão expira durante geração: página recupera jobId do localStorage e retoma polling. Se job foi perdido (restart), exibe "A geração anterior foi interrompida" com opção de reiniciar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE exibir checklist de pré-requisitos (Instagram, Facebook, produtos, objetivo, tom de voz).
- **FR-002**: Sistema DEVE gerar calendário mensal com um clique, sem formulários intermediários.
- **FR-003**: Sistema DEVE exibir progresso da IA com 10 passos dos agentes durante a geração.
- **FR-004**: Sistema DEVE exibir resumo do plano (contagem por tipo de conteúdo — Reels, Carrosséis, Posts, Stories — + objetivo + período).
- **FR-005**: Sistema DEVE exibir calendário em grid com cards de conteúdo (ícone, tipo, título, status).
- **FR-006**: 🚫 NÃO IMPLEMENTADO (MVP) — Sistema DEVE permitir drag-and-drop para reorganizar conteúdos no calendário.
- **FR-007**: Sistema DEVE abrir painel lateral ao clicar em um conteúdo, sem trocar de página.
- **FR-008**: Sistema DEVE permitir edição de conteúdo via chat IA com linguagem natural (backend chama LLM via OpenRouter).
- **FR-009**: Sistema DEVE permitir aprovação e agendamento em massa com um clique (agendamento real em plataforma Meta 🚫 NÃO IMPLEMENTADO).
- **FR-010**: 🚫 NÃO IMPLEMENTADO (futuro) — Sistema DEVE exibir recomendações automáticas pós-agendamento.

### Key Entities

- **CampaignPlan**: Plano mensal gerado pela IA. Contém tenant_id, mês/ano, objetivo, status (draft, active, completed, cancelled), metadata (summary com reelsCount, carouselCount, imageCount, storiesCount + outputs dos agentes).
- **SocialPost**: Post individual dentro de um plano. Contém tipo (reel/carousel/image/stories), título, legenda, CTA, hashtags, prompt_imagem, data_agendada, status (draft/approved/rejected/confirmed/published), dayIndex (1-31).
- **PlannerJob**: Job de geração (in-memory Map no processo). Contém id, status (pending/running/generating/done/error), currentAgent, agentProgress[], planId.
- **Pipeline de 10 Agentes** (`apps/api/src/agents/`): sequência que produz o plano — Context → Research → Analytics → Strategy → Planner → Copywriter → Creative → Quality (com até 2 retries) → Scheduler → Branding (gate de compliance). Cada agente consome o output do anterior; falha de qualidade ou compliance aborta o job com mensagem amigável.

### Bugs conhecidos (reconciliação 2026-07-16)

- **BUG-001** (P1): `POST /planner/generate` recebe `tenantId: 'current'` do frontend mas valida UUID → 400 sempre. Geração 100% quebrada. Fix: controller usa `req.tenant.tenantId`.
- **BUG-002** (P1): rota `/calendario` não registrada — `CalendarioPage.tsx` órfã. Fix: registrar em router + Sidebar.
- **BUG-003** (P1): `GET /planner/jobs/:jobId` sem tenant isolation. Fix: escopar job por tenant.
- **BUG-004** (P1): `GET /planner/plans/latest` não existia — CalendarioPage usava `/plans/latest` que caía em `/plans/:planId`. Fix: adicionar endpoint dedicado.
- **BUG-005** (P1): Sem lock de concorrência — dois cliques em "Gerar" criavam 2 jobs paralelos. Fix: `startPlanGeneration` rejeita (409) se tenant já tem job rodando.
- **BUG-006** (P1): Erros silenciosos — job falhava e UI voltava pro idle sem mensagem. Fix: erro aparece em banner vermelho e permite retentar.
- **BUG-007** (P1): Sem redirect pós-geração — `PlanejadorPage` ficava em `view='review'` com PlanSummary. Fix: ao completar, `navigate('/calendario')`.
- **BUG-008** (P2): Plano sem posts mostrava texto genérico em vez da grade do calendário. Fix: estado vazio tem link "Criar planejamento" + grade só aparece quando plano existe.

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
