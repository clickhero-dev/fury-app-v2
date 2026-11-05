# Feature Specification: Google Meu Negócio (Google Business Profile) para o Ady

**Feature Branch**: `011-google-meu-negocio`

**Created**: 2026-08-17

**Status**: Draft

**Input**: "Google Meu Negócio (Google Business Profile) para o Ady — criar e gerenciar perfis de empresas no Google. O sistema precisa: (1) verificar se o cliente já tem um Google Business Profile existente; (2) se não tem, criar um novo perfil com todos os dados da empresa (nome, endereço, telefone, email, site, categoria, horário de funcionamento, fotos); (3) se tem, gerenciar e atualizar as informações existentes; (4) criar Google Meu Negócio Patrocinado — quando um usuário busca no Google, mostrar o perfil do cliente de forma patrocinada; (5) o Ady gerencia as informações do perfil, mas NÃO responde reviews nem atualiza fotos automaticamente; (6) os dados da empresa podem já estar cadastrados no Ady ou precisam ser preenchidos pelo cliente em uma nova aba de configurações; (7) integração com API oficial do Google Business Profile (precisa ser criada)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Conexão da conta Google e verificação de perfil existente (Priority: P1 🎯 MVP)

O cliente acessa a nova aba "Google Meu Negócio" nas Configurações do Ady e conecta sua conta Google (OAuth). O Ady consulta a API oficial do Google Business Profile e informa, em segundos, se já existe um perfil de empresa para o negócio — com status claro (encontrado / não encontrado / aguardando verificação).

**Why this priority**: É a porta de entrada da feature. Nenhum fluxo (criar, atualizar, patrocinar) funciona sem a conexão OAuth e sem saber se o perfil já existe.

**Independent Test**: Um cliente conecta a conta Google na aba e vê o resultado da verificação (perfil encontrado ou não) com o status correspondente, sem precisar sair da página.

**Acceptance Scenarios**:

1. **Given** o cliente está na aba "Google Meu Negócio" sem conexão, **When** ele clica em "Conectar Google", **Then** o fluxo OAuth redireciona para o Google, autoriza e retorna ao Ady com a conta conectada.
2. **Given** a conta Google está conectada, **When** o Ady consulta a GBP API, **Then** o sistema exibe "Perfil encontrado" com os dados resumidos ou "Nenhum perfil encontrado" com a opção de criar um novo.
3. **Given** a consulta falha por erro da Google (token expirado, escopo faltante), **When** o erro é detectado, **Then** o Ady exibe mensagem clara em português orientando a reconectar.

---

### User Story 2 — Criação de novo perfil com dados completos da empresa (Priority: P1 🎯 MVP)

Quando não existe perfil, o cliente preenche (ou confirma os dados já cadastrados no Ady) nome, endereço, telefone, email, site, categoria, horário de funcionamento e fotos. O Ady cria o perfil na GBP API e acompanha o status de verificação até ficar ativo no Google.

**Why this priority**: Sem criação, não há perfil para gerenciar ou patrocinar. É o passo que entrega valor direto ao cliente.

**Independent Test**: Um cliente sem perfil consegue criar o perfil na GBP API com todos os dados da empresa e vê o status "aguardando verificação" com as instruções da Google.

**Acceptance Scenarios**:

1. **Given** o cliente não tem perfil e preencheu todos os campos obrigatórios, **When** ele clica em "Criar perfil", **Then** o Ady chama a GBP API, persiste o perfil e exibe o status "Aguardando verificação".
2. **Given** o perfil foi criado mas a verificação é exigida pela Google, **When** o cliente visualiza o status, **Then** o Ady exibe as instruções oficiais de verificação (cartão postal, telefone ou email) e atualiza o status automaticamente quando a Google confirmar.
3. **Given** campos obrigatórios ausentes, **When** o cliente tenta criar, **Then** o formulário sinaliza os campos faltantes e impede o envio.

---

### User Story 3 — Atualização e gerenciamento de perfil existente (Priority: P1 🎯 MVP)

Quando o perfil já existe, o cliente visualiza os dados atuais vindos da Google e pode editar nome, endereço, telefone, email, site, categoria e horário de funcionamento. O Ady sincroniza as alterações com a GBP API, mantendo o perfil atualizado no Google.

**Why this priority**: Clientes que já têm perfil representam a maioria dos usuários do Ady — gerenciar é o caso de uso mais frequente.

**Independent Test**: Um cliente com perfil existente edita o horário de funcionamento e confere a atualização refletida no perfil do Google após a sincronização.

**Acceptance Scenarios**:

1. **Given** um perfil encontrado, **When** a aba carrega, **Then** o Ady exibe os dados atuais do perfil vindo da GBP API (não dados locais).
2. **Given** o cliente altera um campo editável, **When** ele salva, **Then** o Ady chama a GBP API e o status do perfil muda para "sincronizando" até confirmar.
3. **Given** a atualização é rejeitada pela Google (ex.: endereço inválido, categoria inexistente), **When** o erro chega ao Ady, **Then** o sistema exibe mensagem amigável com o motivo específico.

---

### User Story 4 — Nova aba de configurações para dados do negócio (Priority: P1 🎯 MVP)

Uma nova aba "Google Meu Negócio" é adicionada às Configurações do Ady. Nela, o cliente preenche os dados da empresa (nome, endereço, telefone, email, site, categoria, horário de funcionamento, fotos) quando eles não existem no Ady, ou revisa os dados que já estão cadastrados na plataforma.

**Why this priority**: A feature depende de dados estruturados do negócio que hoje não existem no Ady (não há endereço/telefone/categoria no tenant) — sem essa aba, criação e sincronização não têm fonte de dados.

**Independent Test**: Um cliente acessa a nova aba e consegue salvar os dados da empresa, que ficam disponíveis para criar/atualizar o perfil do Google.

**Acceptance Scenarios**:

1. **Given** o cliente acessa Configurações, **When** ele navega para a aba "Google Meu Negócio", **Then** a aba exibe o formulário de dados da empresa e a área de conexão/gerenciamento do perfil.
2. **Given** o cliente já preencheu dados da empresa em outras áreas do Ady (nome do tenant, businessContext, branding), **When** a aba carrega, **Then** o Ady pré-preenche os campos com os dados existentes.
3. **Given** dados da empresa salvos, **When** o cliente cria ou atualiza o perfil do Google, **Then** o Ady usa esses dados como fonte.

---

### User Story 5 — Interface de visualização, status e notificações do perfil (Priority: P2)

O cliente acompanha o perfil em um painel único: status atual (não conectado / conectado / perfil não encontrado / aguardando verificação / verificado / sincronizando / erro), última sincronização e histórico. O Ady notifica o cliente (in-app e email) quando o status muda, ex.: verificação concluída, falha de sincronização.

**Why this priority**: Transparência sobre o que está acontecendo no Google gera confiança, mas o MVP funciona sem o painel de histórico completo.

**Independent Test**: Um cliente vê o status do perfil e recebe uma notificação quando a verificação é concluída pela Google.

**Acceptance Scenarios**:

1. **Given** um perfil em "Aguardando verificação", **When** a Google confirma a verificação, **Then** o Ady atualiza o status para "Verificado" e notifica o cliente.
2. **Given** uma sincronização falhou, **When** o erro é registrado, **Then** o painel exibe o status "Erro" com o motivo e a opção "Tentar novamente".

---

### User Story 6 — Google Meu Negócio Patrocinado (Priority: P2 ⚠️ Requer clarificação)

Quando o perfil está verificado, o cliente pode ativar o modo patrocinado: ao buscar por termos relacionados ao negócio no Google (Pesquisa/Maps), o perfil aparece de forma patrocinada (com selo/posição destacada). O Ady configura a campanha e gerencia os dados do anúncio.

**Why this priority**: É o diferencial comercial da feature, mas depende de produtos de publicidade do Google (Google Ads / Local Services Ads) e de orçamento pago — escopo a confirmar antes do planejamento.

**Independent Test**: Um cliente com perfil verificado ativa o patrocinado e o perfil aparece destacado em uma busca de teste no Google.

**Acceptance Scenarios**:

1. **Given** um perfil verificado, **When** o cliente ativa o patrocinado na aba, **Then** o Ady inicia o fluxo de configuração do anúncio no Google.
2. **Given** o patrocinado está ativo, **When** o usuário busca o negócio no Google, **Then** o perfil aparece em posição patrocinada com o selo correspondente.
3. **Given** o cliente desativa o patrocinado, **When** ele confirma a ação, **Then** o anúncio é pausado e o status atualiza no painel.

---

### Edge Cases

- Conta Google já conectada a outro tenant: o Ady deve detectar o conflito e orientar a usar outra conta (mesmo padrão do Meta).
- Token OAuth expirado entre uma ação e outra: o Ady deve renovar silenciosamente ou pedir reconexão, preservando os dados preenchidos.
- Cliente não tem perfil, mas o endereço digitado corresponde a um perfil já existente no Google (criado por terceiros/duplicado): o Ady deve alertar sobre o possível duplicado e sugerir reivindicação em vez de criar outro.
- Perfil já verificado que precisa reivindicação (o cliente perdeu acesso à conta dona do perfil): fluxo de reivindicação deve ser orientado, não bloqueado.
- Categoria selecionada não existe na GBP API: validação contra o catálogo oficial de categorias da Google com sugestões.
- Horário de funcionamento em feriados ou "24 horas": campos específicos da GBP API tratados como opcionais com defaults sensatos.
- Fotos: o Ady NÃO publica fotos automaticamente — apenas associa as fotos fornecidas pelo cliente de forma manual (limitação explícita da feature).
- Reviews: o Ady NÃO responde reviews automaticamente (limitação explícita da feature).
- Sessão expira durante o fluxo OAuth do Google: redireciona para reiniciar com os dados já preenchidos preservados.
- Patrocinado sem orçamento/forma de pagamento configurada: a ativação é bloqueada com orientação de configuração.
- Google cobra pelo patrocinado: pagamentos do Google Ads/Local Services não passam pela cobrança do Ady (a confirmar).

## Contexto — Código Existente

O que existe hoje na base e será reutilizado/extendido:

- **`tenants`** (`packages/db/src/schema.ts:55`): tabela por cliente com `name`, `slug`, `codigo`, `businessContext`. **Não há** endereço, telefone, email público, site, categoria ou horário estruturados — esses dados precisarão de tabela/campos novos ou da aba de configurações.
- **`metaConnections`** (`packages/db/src/schema.ts:99`): padrão de conexão OAuth por tenant (tenantId + accessToken + tokenExpiresAt + seleções). A conexão do Google seguirá o mesmo padrão (ex.: `googleConnections`).
- **OAuth Meta** (`apps/api/src/routes/meta.routes.ts:12-13` + `controllers/meta.controller.ts:23,40`): fluxo `GET /auth/url` → `GET /auth/callback` com redirect para o frontend. Padrão a replicar para o Google.
- **Configurações** (`apps/web/src/pages/configuracoes/Configuracoes.tsx` + `ConfiguracoesTabsNav.tsx`): sistema de abas (`geral`, `seguranca`, `faturamento`, `publico`, `metas`) — a aba "Google Meu Negócio" será adicionada aqui (ou como página `/configuracoes/google-meu-negocio`, seguindo o padrão de `/configuracoes/integracoes`).
- **Regras do projeto**: multi-tenancy com escopo por `tenant_id` em todos os endpoints, validação Zod, envelope `ApiResponse<T>`, services como funções puras injetáveis (Constitution III e VII).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE permitir conectar a conta Google do cliente via OAuth 2.0 e persistir a conexão por tenant (token, refresh token, expiração).
- **FR-002**: Sistema DEVE verificar, via API oficial do Google Business Profile, se já existe um perfil para o negócio do cliente e exibir o resultado.
- **FR-003**: Sistema DEVE criar um novo perfil na GBP API com nome, endereço, telefone, email, site, categoria, horário de funcionamento e fotos fornecidas pelo cliente.
- **FR-004**: Sistema DEVE atualizar as informações de um perfil existente na GBP API quando o cliente editar os dados.
- **FR-005**: Sistema DEVE sincronizar o estado do perfil com a Google (status: não conectado, conectado, sem perfil, aguardando verificação, verificado, sincronizando, erro) e notificar o cliente nas transições relevantes.
- **FR-006**: Sistema DEVE NÃO responder reviews nem atualizar fotos automaticamente — fotos são associadas apenas manualmente pelo cliente.
- **FR-007**: Sistema DEVE oferecer uma nova aba de configurações onde o cliente preenche/revisa os dados da empresa, pré-preenchendo com dados já existentes no Ady (tenant name, businessContext, branding).
- **FR-008**: Sistema DEVE configurar o modo patrocinado do perfil no Google (Pesquisa/Maps) para clientes com perfil verificado.
- **FR-009**: Sistema DEVE exibir status, histórico e última sincronização do perfil na interface.
- **FR-010**: Sistema DEVE renovar tokens OAuth expirados ou solicitar reconexão sem perder os dados preenchidos.
- **FR-011**: Sistema DEVE impedir criação de perfil duplicado quando o endereço indicar perfil já existente (sugerir reivindicação).
- **FR-012**: Sistema DEVE validar categoria contra o catálogo oficial de categorias da GBP API.

*Requisitos clarificados:*

- **FR-008**: Patrocinado = Google Ads com extensões de localização (quando o usuário busca, o perfil aparece destacado). O cliente paga diretamente ao Google; o Ady apenas configura e gerencia os dados do anúncio.
- **FR-003**: A criação de perfil via GBP API pode exigir verificação adicional (cartão postal, telefone, email). Se a API não permite criação direta, o Ady orienta o cliente a criar manualmente e acompanhar o status.
- **FR-006**: Fotos são armazenadas localmente no Ady (via `storage.service.ts`). O Ady NÃO publica fotos na GBP API — apenas associa as fotos fornecidas pelo cliente de forma manual na interface.

### Key Entities

- **GoogleConnection**: Conexão OAuth por tenant (padrão `metaConnections`). Contém tenantId, googleUserId, accessToken, refreshToken, tokenExpiresAt, accountId/accountName selecionados.
- **GoogleBusinessProfile**: Perfil da empresa no Google espelhado no Ady. Contém tenantId, connectionId, gbpLocationId, nome, endereço (street, city, state, postalCode), telefone, email, site, categoria, horário de funcionamento (jsonb), fotos (jsonb), status de verificação, status de sincronização, lastSyncedAt.
- **BusinessProfileSettings** (opcional): Dados estruturados do negócio preenchidos na aba de configurações (fonte de dados para criação/atualização), quando não houver dados equivalentes no tenant.
- **SyncLog**: Histórico de operações (verificação, criação, atualização, erros) com status, mensagem e timestamp — base para o painel de status/notificações.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos clientes conseguem conectar a conta Google e ver o resultado da verificação de perfil em menos de 30 segundos.
- **SC-002**: Cliente completa a criação de um perfil novo (dados → criar → verificação) em menos de 5 minutos de interação.
- **SC-003**: 90% das atualizações de perfil são refletidas no Google na primeira sincronização (sem retry manual).
- **SC-004**: 100% das notificações de mudança de status chegam ao cliente em menos de 1 minuto após a transição.
- **SC-005**: Zero erros de dados entre tenants (nenhum dado de um cliente vaza para outro) — isolamento por tenant_id verificado em auditoria.
- **SC-006** (pós-deploy): ≥ 50% dos clientes com perfil verificado ativam o patrocinado no primeiro mês.

## Assumptions

- O fluxo de OAuth do Google seguirá o padrão existente do Meta (auth/url → auth/callback → redirect para o frontend).
- A conta Google conectada pertence ao cliente e tem acesso ao Google Business Profile do negócio.
- O cadastro de dados da empresa (aba de configurações) é a fonte primária de dados para criação/atualização do perfil.
- A verificação de um perfil novo é feita pela Google (cartão postal, telefone ou email) e pode levar dias — o Ady não pode acelerá-la, apenas acompanhar o status.
- O Google Business Profile API exige projeto no Google Cloud, credenciais OAuth e escopos específicos; a integração "precisa ser criada" do zero.
- Notificações reutilizam o canal de email existente (`email.service.ts`) e notificações in-app.
- A cobrança do patrocinado (se aplicável) é paga pelo cliente diretamente ao Google, fora do billing do Ady.
- A feature é para os mesmos clientes do Ady (pequenos negócios locais, português-BR).

## Clarifications

### Session 2026-08-17

Questões abertas que devem ser respondidas antes do planejamento:

- Q1: "Patrocinado" — usar Google Local Services Ads, Google Ads (extensiones de localização) ou selo "Google Guaranteed"? Quem paga e qual o fluxo de cobrança?
- Q2: Criação de perfil — a GBP API tem restrições de criação por país/verificação. Qual o fallback quando a API não permite criação (orientação manual)?
- Q3: Fotos — o Ady publica fotos na GBP API quando o cliente faz upload manual, ou apenas armazena localmente?
- Q4: Notificações — além de email, notificar por WhatsApp (canal já usado pelo Ady)?
- Q5: Onde fica a nova aba — dentro de `/configuracoes` como nova tab ou página separada `/configuracoes/google-meu-negocio`?