# Relatório Técnico — Análise de Feedback Fury
**Fonte:** Sessão de usabilidade (PDF: Análise Fury.pdf)  
**Data:** 2026-07-14  
**Escopo:** Estúdio, Dashboard, Campanhas, Superadmin, Publicação Meta  
**Fabricação de números:** nenhuma | **Status:** análise

---

## Sumário

| ID | Módulo | Tipo | Severidade | Título |
|---|---|---|---|---|
| FURY-001 | Estúdio | UX / Feature | High | Confirmar prompt antes de gerar imagem |
| FURY-002 | Estúdio | Bug | High | Correção de texto regenera criativo inteiro |
| FURY-003 | Estúdio | Bug | Critical | Botão "Usar em campanha" não funciona |
| FURY-004 | Meta | Bug | High | Botão "Publicar no Meta" retorna erro |
| FURY-005 | Dashboard | Feature | Medium | Filtro de data personalizada |
| FURY-006 | Dashboard | UX | Medium | Origem do número "819" sem rastreabilidade |
| FURY-007 | Campanhas | Feature | Medium | Gerar título e texto via IA |
| FURY-008 | Auth | Bug | Critical | Logout espontâneo durante sessão |
| FURY-009 | Campanhas | UX | Low | Exibir criativo associado na lista |
| FURY-010 | Campanhas | Bug | High | Pausar campanha sem efeito |
| FURY-011 | Campanhas | UX | Medium | Editar público/alvo/idade/gênero inline |
| FURY-012 | Campanhas | Bug | High | Campanha publicada não aparece em ativas |
| FURY-013 | Superadmin | Bug | High | Link do superadmin quebrado |

---

## Detalhamento

### FURY-001 — Confirmar prompt antes de gerar
- **Módulo:** Estúdio
- **Tipo:** UX / Feature
- **Severidade:** High
- **User Story:** Como usuário do Estúdio, eu quero revisar o prompt final antes da geração para evitar perder criativos com direção errada.
- **Critério de Aceite:** Ao acionar geração, o modal/screen mostra o prompt pronto; botões "Confirmar e gerar" e "Editar prompt".
- **Nota:** Isso também desbloqueia FURY-002 — se o usuário aprova o prompt antes, a correção posterior pode ser por inpainting/diretriz textual sem regenerar tudo.
---

### FURY-002 — Correção de texto regenera criativo inteiro
- **Módulo:** Estúdio
- **Tipo:** Bug
- **Severidade:** High
- **User Story:** Como usuário, eu quero corrigir erros de ortografia na imagem sem perder o layout/conceito do criativo.
- **Critério de Aceite:** 
  - Correção pontual não altera composição existente.
  - Não reintroduz erros ortográficos em texto previamente correto.
- **Nota técnica:** suspeita de caminho que usa `regenerate` ao invés de `editImage`/`inpaintImage`. Verificar se o fluxo está usando DALL-E 2 inpaint ou Gemini edit com máscara.
---

### FURY-003 — Botão "Usar em campanha" não funciona
- **Módulo:** Estúdio → Campanhas
- **Tipo:** Bug
- **Severidade:** Critical
- **User Story:** Como usuário, eu quero reutilizar um criativo aprovado em uma nova campanha sem refazer upload.
- **Critério de Aceite:** Click no botão abre modal/seleção de campanha existente ou cria nova com criativo pré-selecionado.
- **Nota:** Interrompe fluxo principal. Checar network tab + handler do botão primeiro.
---

### FURY-004 — Botão "Publicar no Meta" retorna erro
- **Módulo:** Meta
- **Tipo:** Bug
- **Severidade:** High
- **User Story:** Como usuário, eu quero publicar diretamente no Meta sem copiar assets manualmente.
- **Critério de Aceite:** App envia campanha/criativo → Meta, retorna ID da publicação ou mensagem de erro legível.
- **Nota:** Mascarar erro genérico. Likely: auth token expirado, permissions, ou schema do payload divergente do Graph API.
---

### FURY-005 — Filtro de data personalizada no Dashboard
- **Módulo:** Dashboard
- **Tipo:** Feature
- **Severidade:** Medium
- **User Story:** Como usuário, eu quero escolher o intervalo de datas para analisar métricas.
- **Critério de Aceite:** Date range picker; comparação entre períodos opcional.
- **Nota:** Usar `<input type="date">` nativo; evita lib de calendário nova.
---

### FURY-006 — Rastreabilidade da projeção "819"
- **Módulo:** Dashboard
- **Tipo:** UX
- **Severidade:** Medium
- **User Story:** Como usuário, eu quero entender como a projeção de alcance é calculada.
- **Critério de Aceite:** Tooltip ou modal ao lado do número com fórmula/fonte (orçamento, CTR histórico, audience size).
- **Nota:** Pode ser um agrupamento/aggregation sem documento. Revejo query e adiciona documentação inline antes do uso em UI.
---

### FURY-007 — Gerar título e texto via IA
- **Módulo:** Campanhas
- **Tipo:** Feature
- **Severidade:** Medium
- **User Story:** Como usuário, eu quero que a IA corrija/complete minha ideia de copy para campanha.
- **Critério de Aceite:** Campo de ideia bruta → IA devolve título + texto; usuário pode editar antes de salvar.
- **Nota:** Reutilizar modelo de geração já usado no Estúdio; não precisa de novo endpoint.
---

### FURY-008 — Logout espontâneo
- **Módulo:** Auth
- **Tipo:** Bug
- **Severidade:** Critical
- **User Story:** Como usuário autenticado, eu quero manter a sessão estável durante o uso.
- **Critério de Aceite:** Sessão persiste sem logout forçado; re-login automático com refresh token válido.
- **Nota:** Causa raiz provável — token expirado sem refresh, ou timeout agressivo no cliente. Check `authContext`/`withAuth` e refresh flow.
---

### FURY-009 — Exibir criativo na lista de campanhas
- **Módulo:** Campanhas
- **Tipo:** UX
- **Severidade:** Low
- **User Story:** Como usuário, eu quero ver o criativo associado diretamente na listagem para identificá-lo rapidamente.
- **Critério de Aceite:** Thumbnail do criativo em cada card/row da lista.
- **Nota:** Reuso do endpoint de imagem já existente.
---

### FURY-010 — Pausar campanha não funciona
- **Módulo:** Campanhas
- **Tipo:** Bug
- **Severidade:** High
- **User Story:** Como usuário, eu quero pausar/reativar campanhas sem precisar recriar.
- **Critério de Aceite:** Click em pausar atualiza status para `paused`; indicador visual muda; mutação retorna sucesso.
- **Nota:** Verificar mutation/PATCH e optimistic update.
---

### FURY-011 — Editar público/alvo inline na campanha
- **Módulo:** Campanhas
- **Tipo:** UX
- **Severidade:** Medium
- **User Story:** Como usuário, eu quero ajustar público, idade e gênero diretamente na tela da campanha.
- **Critério de Aceite:** Modal ou inline edit com validação dos limites do Meta Ads (idade 13-65+, gender enum).
- **Nota:** Validar schema atual; provavelmente só falta o form/mutation.
---

### FURY-012 — Campanha publicada não aparece em ativas
- **Módulo:** Campanhas
- **Tipo:** Bug
- **Severidade:** High
- **User Story:** Como usuário, eu quero ver minhas campanhas ativas imediatamente após publicar.
- **Critério de Aceite:** Após publicação bem-sucedida, campanha aparece no filtro "Ativas" sem reload manual.
- **Nota:** Possível race entre sync do Meta e list local, ou status inicial errado no banco.
---

### FURY-013 — Link do superadmin quebrado
- **Módulo:** Superadmin
- **Tipo:** Bug
- **Severidade:** High
- **User Story:** Como superadmin, eu quero acessar o painel de admin sem obstáculos.
- **Critério de Aceite:** Link roteia corretamente carregando o painel protegido por role/permission.
- **Nota:** Checar `href` do link e proteção de rota (`getServerSideProps`/middleware).
---

## Ordem sugerida de ataque

1. **FURY-008** e **FURY-003** — bloqueiam fluxo principal
2. **FURY-002** — impede geração de múltiplos variantes
3. **FURY-004** e **FURY-012** — entrega Meta falha
4. **FURY-001** → habilita **FURY-002**
5. Resto: UX e features (FURY-005, FURY-006, FURY-007, FURY-009, FURY-010, FURY-011, FURY-013)
