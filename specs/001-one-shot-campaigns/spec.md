# Feature Specification: Anúncios One-Shot para Pequenos Negócios

**Feature Branch**: `001-one-shot-campaigns`

**Created**: 2026-07-02

**Status**: Draft

**Input**: Descrição do produto: automação de anúncios Meta Ads com criação
de criativos de alta qualidade, voltada para pequenos negócios locais.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Configuração Rápida da Loja (Priority: P1 🎯 MVP)

O dono de uma pequena loja acessa o FURY, conecta sua conta Meta Ads
em poucos cliques, informa o nome do negócio, segmento (ex: restaurante,
salão, loja de roupas) e um orçamento diário. O FURY pré-configura
a campanha com base nesses dados.

**Why this priority**: Sem conexão Meta e dados da loja, nenhum anúncio
pode ser criado. É a porta de entrada obrigatória.

**Independent Test**: Um novo usuário consegue conectar a conta Meta e
finalizar a configuração inicial em menos de 3 minutos, sem erros.

**Acceptance Scenarios**:

1. **Given** um usuário nunca conectou o Meta, **When** ele clica em
   "Conectar Meta", **Then** o fluxo OAuth redireciona para o Facebook,
   autoriza e retorna ao FURY com a conta conectada.
2. **Given** o usuário conectou sua conta, **When** ele informa o nome
   da loja, segmento e orçamento diário, **Then** o FURY exibe um resumo
   da configuração e o botão "Criar Anúncio".
3. **Given** o usuário tenta conectar uma conta Meta já vinculada a
   outro tenant, **When** o sistema detecta o conflito, **Then** exibe
   mensagem clara e orienta a usar outra conta.

---

### User Story 2 — Criação de Criativo com Branding (Priority: P1 🎯 MVP)

Após configurar a loja, o usuário informa o que quer anunciar
(produto/serviço, oferta). O FURY gera automaticamente um criativo
(imagem + texto) seguindo as regras de branding que o usuário pré-definiu
(logo, cores, tom de voz). O usuário vê o preview e pode aprovar ou
regenerar.

**Why this priority**: O criativo é o coração do anúncio. Sem ele,
não há campanha. A geração automatizada com branding é o diferencial
para o público leigo.

**Independent Test**: Um usuário consegue gerar um criativo completo
(texto + imagem) informando apenas o nome do produto e uma oferta,
sem precisar editar manualmente.

**Acceptance Scenarios**:

1. **Given** o usuário já configurou a loja e as regras de branding,
   **When** ele informa o nome do produto e a oferta, **Then** o FURY
   gera 3 opções de criativo (imagem + headline + texto) em até 30s.
2. **Given** o FURY gerou as opções de criativo, **When** o usuário
   clica em "Regenerar" em uma opção, **Then** uma nova variação
   substitui a anterior mantendo as regras de branding.
3. **Given** o usuário aprovou um criativo, **When** ele segue para
   revisão do anúncio, **Then** o criativo aprovado é exibido no resumo
   final.

---

### User Story 3 — Publicação One-Shot (Priority: P1 🎯 MVP)

Com a loja configurada e o criativo aprovado, o usuário clica em
"Publicar Anúncio". O FURY cria a campanha, conjunto de anúncios e
o anúncio na Meta Ads em segundo plano. O usuário vê uma tela de
sucesso com o link para visualizar o anúncio no Gerenciador de Anúncios.

**Why this priority**: O "one-shot" é o propósito central. O usuário
não quer configurar campanha, segmentação, lances — quer que funcione.

**Independent Test**: Um usuário consegue publicar um anúncio real
na Meta Ads com exatamente 3 cliques após a configuração inicial.

**Acceptance Scenarios**:

1. **Given** tudo configurado (loja + criativo aprovado), **When** o
   usuário clica em "Publicar Anúncio", **Then** o FURY cria a campanha
   na Meta Ads com status ativo em menos de 60s.
2. **Given** a publicação falha por erro da Meta (ex: criativo violou
   política), **When** o erro é detectado, **Then** o FURY exibe uma
   mensagem amigável explicando o problema e sugerindo ajustes.
3. **Given** o anúncio foi publicado com sucesso, **When** a página
   de confirmação carrega, **Then** o FURY exibe o orçamento diário,
   prazo estimado e link "Ver no Meta Ads Manager".

---

### User Story 4 — Branding Rules Setup (Priority: P2)

Antes de criar anúncios, o usuário pode acessar "Minha Marca" para
definir: logo da empresa, paleta de cores (primária/secundária), tom
de voz (profissional, casual, divertido) e exemplos de postagens que
gostou. Essas regras guiam toda a criação de criativos.

**Why this priority**: O branding consistente é essencial para transmitir
confiança e qualidade. Mas o MVP pode começar com valores padrão
enquanto essa tela é construída.

**Independent Test**: Um usuário consegue definir as 4 regras de
branding e gerar um criativo que as respeite visual e textualmente.

**Acceptance Scenarios**:

1. **Given** o usuário acessa "Minha Marca", **When** ele faz upload
   do logo, seleciona cores e escolhe tom de voz, **Then** as regras
   são salvas e aplicadas na próxima geração de criativo.
2. **Given** as regras de branding estão configuradas, **When** o
   usuário gera um criativo, **Then** a paleta de cores do criativo
   corresponde à primária/secundária definida e o tom do texto segue
   o tom de voz escolhido.
3. **Given** o usuário não configurou branding, **When** ele gera
   um criativo, **Then** o FURY usa valores padrão harmônicos e sugere
   que o usuário configure a marca.

---

### User Story 5 — Acompanhamento Simplificado (Priority: P3)

Após a publicação, o usuário vê um dashboard minimalista: "Seu anúncio
está no ar há X dias", "Pessoas alcançadas: Y", "Cliques: Z". Métricas
em linguagem simples, sem jargão de marketing.

**Why this priority**: Transparência e confiança. Mas não bloqueia o
fluxo principal de publicar anúncios.

**Independent Test**: Um usuário consegue ver as métricas do anúncio
em português claro, sem precisar entender termos como CPC, CTR ou ROAS.

**Acceptance Scenarios**:

1. **Given** um anúncio publicado há mais de 24h, **When** o usuário
   acessa o dashboard, **Then** vê "Pessoas que viram o anúncio: [X]"
   e "Vezes que clicaram: [Y]" em linguagem natural.
2. **Given** o anúncio está com baixo desempenho (menos de 10 cliques
   em 3 dias), **When** o dashboard carrega, **Then** o FURY exibe
   uma sugestão simples: "Que tal aumentar o orçamento diário?"
3. **Given** o anúncio está ativo, **When** o usuário clica em
   "Pausar Anúncio", **Then** a campanha é pausada na Meta e o status
   atualiza no dashboard em até 2 minutos.

---

### Edge Cases

- Usuário desconecta a conta Meta antes de publicar: o fluxo orienta
  a reconectar sem perder os dados já preenchidos.
- Orçamento diário abaixo do mínimo da Meta (R$ 5,00/dia): validação
  com mensagem clara ("O valor mínimo para anúncios é R$ 5,00 por dia").
- Criativo rejeitado pela Meta por política de anúncios: mensagem
  traduzida com o motivo específico e sugestão de correção.
- Usuário tenta publicar sem ter configurado a loja: formulário guiado
  impede avançar sem os campos obrigatórios (nome, segmento, orçamento).
- Sessão expira durante o fluxo OAuth: redireciona para reiniciar com
  os dados já preenchidos preservados.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE autenticar usuários e gerenciar conexão OAuth
  com Meta Ads (Facebook Login + Marketing API).
- **FR-002**: Sistema DEVE coletar dados mínimos do negócio: nome da
  loja, segmento de mercado e orçamento diário.
- **FR-003**: Sistema DEVE gerar criativos (imagem + headline + texto
  principal) com base no produto/serviço e oferta informados.
- **FR-004**: Sistema DEVE aplicar regras de branding (logo, paleta de
  cores, tom de voz) na geração de criativos.
- **FR-005**: Sistema DEVE criar campanha, conjunto de anúncios e
  anúncio na Meta Ads com os dados fornecidos em uma única ação do
  usuário.
- **FR-006**: Sistema DEVE exibir preview do criativo antes da
  publicação e permitir regeneração.
- **FR-007**: Sistema DEVE exibir mensagens de erro em português claro
  quando a Meta Ads API rejeitar a campanha ou criativo.
- **FR-008**: Sistema DEVE exibir métricas simplificadas do anúncio
  (alcance, cliques, dias no ar) em linguagem não-técnica.
- **FR-009**: Sistema DEVE permitir pausar o anúncio diretamente do
  dashboard.
- **FR-010**: Sistema DEVE preservar dados preenchidos pelo usuário em
  caso de sessão expirada ou erro na conexão OAuth.

### Key Entities

- **Tenant (Loja)**: Representa o negócio do usuário. Contém nome,
  segmento, orçamento diário padrão e regras de branding.
- **BrandingRules**: Logo da empresa, paleta de cores (primária,
  secundária), tom de voz, exemplos de referência.
- **CreativeAsset**: Criativo gerado (imagem + headline + texto).
  Associado a um tenant e às regras de branding usadas na geração.
- **Campaign**: Campanha publicada na Meta Ads. Contém IDs da Meta
  (campaign_id, adset_id, ad_id), status e data de criação.
- **CampaignMetrics**: Métricas simplificadas (alcance, cliques,
  gasto, dias ativo) sincronizadas periodicamente da Meta Ads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um novo usuário completa o fluxo completo (conexão →
  configurar loja → gerar criativo → publicar) em menos de 5 minutos.
- **SC-002**: 90% dos usuários que iniciam o fluxo publicam o anúncio
  com sucesso na primeira tentativa.
- **SC-003**: 80% dos usuários aprovam o primeiro criativo gerado
  sem necessidade de regeneração.
- **SC-004**: O tempo entre o clique em "Publicar Anúncio" e o anúncio
  ativo na Meta Ads é inferior a 90 segundos.
- **SC-005**: Usuários classificam a experiência como "fácil" ou "muito
  fácil" em pesquisa NPS pós-publicação (meta: NPS ≥ 50).
- **SC-006**: Após 7 dias de anúncio ativo, 70% dos usuários retornam
  ao dashboard para ver as métricas.

## Assumptions

- O fluxo de OAuth com Meta Ads já existe na base de código atual e
  será reutilizado.
- O Estúdio Criativo (geração de imagem + texto por IA) já existe
  e será estendido para aceitar regras de branding e gerar
  headlines/texto automaticamente.
- O orçamento diário é em reais (R$) e o valor mínimo é R$ 5,00
  (exigência da Meta).
- A segmentação padrão será geográfica (raio de 10km do negócio) e
  por interesses amplos do segmento escolhido.
- O usuário já possui uma página no Facebook vinculada ao negócio
  (exigência da Meta Ads).
- O público-alvo fala português e está no Brasil.
