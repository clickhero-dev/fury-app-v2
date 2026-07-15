# Research: Planejador IA

## Decision Log

### 1. LangGraph vs OpenRouter direto

- **Decision**: OpenRouter direto, sem LangGraph
- **Rationale**: O fluxo do Planejador é um pipeline linear de 12 passos. LangGraph adicionaria complexidade de grafo sem benefício — não há branching, loops, ou paralelismo real no MVP. O service chama OpenRouter uma única vez com um prompt estruturado que gera todo o plano de uma vez.
- **Alternatives Considered**:
  - LangGraph: complexidade injustificada para pipeline linear
  - BullMQ chain: cada passo como job separado — latência proibitiva

### 2. pgvector

- **Decision**: Incluir no schema, não usar no MVP
- **Rationale**: A coluna `embedding` nas tabelas `campaign_plans` e `social_posts` é incluída no schema para viabilizar RAG futuro (recomendações baseadas em posts anteriores). Sem uso no MVP — removê-la agora geraria migration futura.
- **Alternatives Considered**: Sem pgvector: migration extra depois. Com pgvector: zero custo no MVP.

### 3. Polling vs WebSocket

- **Decision**: Polling (setInterval 1.5s no frontend, GET /api/planner/jobs/:id)
- **Rationale**: Infraestrutura existente não tem SSE/WS. Polling é simples, confiável, e o job de geração leva < 60s — no máximo 40 requisições. Tráfego negligible.
- **Alternatives Considered**:
  - SSE: precisaria de nova infra no backend
  - WebSocket: superdimensionado para notificações de job

### 4. Tema escuro vs tema claro

- **Decision**: Usar tema claro (light mode) da plataforma existente
- **Rationale**: A plataforma FURY é light mode por padrão (bg #ffffff, surface #f6f8fa). O spec original pedia tema escuro, mas isso criaria inconsistência visual. Usar as variáveis CSS do tema (`--color-background`, `--color-surface`, `--color-text-primary`, `--color-accent`) garante consistência com o restante da plataforma e suporte automático a dark mode via `html.dark`.
- **Alternatives Considered**:
  - Dark mode fixo na página: quebra consistência com o resto do app
  - Dark mode via CSS variables: já funciona com `html.dark`, mas default é light

### 5. @dnd-kit para drag-and-drop

- **Decision**: Usar @dnd-kit/core + @dnd-kit/sortable
- **Rationale**: Única dependência externa nova. Leve (~5KB gzip), acessível, bem mantida. A alternativa (react-beautiful-dnd) foi arquivada.
- **Alternatives Considered**:
  - react-beautiful-dnd: arquivado/mantido
  - HTML5 nativo: sem suporte mobile touch consistente
