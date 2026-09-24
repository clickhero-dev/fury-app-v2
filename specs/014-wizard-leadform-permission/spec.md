# Feature Specification: Permissão de Criação de Formulário de Leads (pages_manage_ads)

**Feature Branch**: `fix/wizard-leadform-pages-manage-ads`

**Created**: 2026-09-22

**Status**: Implementado — Page access token + validação de task ADVERTISE (issue #213)

**Input**: Ao criar uma campanha de Formulário (objetivo `leads`), o Meta recusa a criação do
`leadgen_forms` por falta de permissão. O fluxo orienta o usuário a reconectar o Meta para
conceder a permissão, mas **após a reconexão o erro persiste**. Este spec documenta o
comportamento esperado (BDD) e os pontos onde o problema pode estar.

## Contexto técnico (investigação e2e)

Fluxo atual de criação de campanha de Formulário:

1. Wizard Step 5 → `POST /api/campaigns/create-wizard` (`createWizardCampaign`).
2. `CampaignsService.createCampaignFromWizard` (`apps/api/src/services/campaigns/campaigns.service.ts:701`).
3. Para objetivo `leads`, chama `meta.createLeadForm(pageId, accessToken, body)` no passo `lead_form`
   (`campaigns.service.ts:897`) **antes** de criar campanha/adset (fail-fast).
4. `accessToken` = token da conexão (`decryptMetaToken(metaConn.accessToken)` — **token de usuário**,
   não Page token) em `campaigns.service.ts:714`.
5. `DefaultMetaCampaignProvider.createLeadForm` faz `POST /{page_id}/leadgen_forms`
   (`apps/api/src/lib/providers/default-meta-campaign.provider.ts:85`).
6. Erro → `mapWizardMetaError(err, 'lead_form')` → `META_PERMISSION_DENIED`
   (`campaigns.service.ts:181`).
7. Frontend Step 5: exibe a mensagem + botão **"Reconectar Meta"** → `GET /api/meta/auth/url`
   com `rerequest=true` (`Step5Review.tsx:43`).
8. Callback OAuth (`meta.service.ts:339`) atualiza o token da conexão existente.

### Achados (causas prováveis do "erro persiste")

1. **Permissão exigida ≠ permissão solicitada antes do fix**: a doc oficial de Lead Ads
   (marketing-api/guides/lead-ads/create/) diz que criar `leadgen_forms` exige `pages_manage_ads`
   (não `pages_manage_metadata`, que é só para webhooks leadgen). Antes do commit `2551dab` o OAuth
   nunca pedia `pages_manage_ads`, então reconectar não concedia a permissão certa.
2. **`auth_type=rerequest`** foi adicionado no commit `2551dab` para a reconexão re-exibir
   permissões já declinadas — sem isso o Login Dialog omite a permissão silenciosamente e o token
   novo nasce sem ela.
3. **Page token vs user token**: a doc exige *"A Page access token from a person who can perform
   the ADVERTISE task on the Page"*. O código usa o token de usuário da conexão
   (`campaigns.service.ts:714,897`). Se a permissão estiver no user token mas a pessoa não tiver a
   task `ADVERTISE` na Página selecionada (ex.: página de outro dono/BM), o Meta continua recusando
   mesmo após reconectar.
4. **Mensagem genérica oculta a causa real**: `mapWizardMetaError` para o passo `lead_form` lança
   mensagem fixa e descarta `metaUserMsg`/`metaBlameField` reais do Meta
   (`campaigns.service.ts:214-219`). Dificulta o diagnóstico de qual permissão/task falta.
5. **Frontend de Integrações não vigia `pages_manage_ads`**: `REQUIRED_SCOPES` em
   `IntegracoesContent.tsx:292` cobre `pages_show_list`, `ads_management`, `ads_read`,
   `instagram_content_publish` — mas **não** `pages_manage_ads`/`leads_retrieval`. O banner de
   reconexão não aparece quando a permissão que falta é exatamente a do Formulário.

## Decisões Confirmadas

1. **Permissão correta**: `pages_manage_ads` é a permissão que a Meta exige para
   `POST /{page_id}/leadgen_forms` (doc Lead Ads create). `pages_manage_metadata` é para webhooks
   leadgen (futuro). `leads_retrieval` é para leitura de leads.
2. **Token da chamada**: usar o **Page access token** da Página selecionada, obtido via
   `/me/accounts?fields=id,name,access_token,tasks` (paginação). Esse endpoint é a fonte única que
   devolve token por Página e **cobre tanto páginas de admin direto quanto as acessadas via
   Business Manager** (requer a permissão `business_management` — já presente no OAuth). Fluxo único,
   sem tratamento especial por origem da Página. Sem token → erro claro `META_PAGE_NOT_MANAGED`.
3. **Validação de task**: além do token, validar que o usuário tem a task **`ADVERTISE`** na Página
   (campo `tasks` do `/me/accounts`). Sem ela → `META_PAGE_ADVERTISE_TASK_REQUIRED` (usuário tem
   acesso à Página, mas não pode anunciar — ex.: papel Analyst).
4. **Diagnóstico**: a mensagem de erro do passo `lead_form` deve preservar a mensagem real do Meta
   quando disponível, sem substituir por texto genérico.
5. **Frontend Integrações**: `REQUIRED_SCOPES` deve incluir `pages_manage_ads` e `leads_retrieval`
   para o banner de reconexão aparecer quando faltarem.
6. **Frontend Step 5**: `META_PAGE_NOT_MANAGED` e `META_PAGE_ADVERTISE_TASK_REQUIRED` **não** oferecem
   o botão "Reconectar Meta" — reconectar o OAuth não resolve; a mensagem orienta a trocar de Página
   ou solicitar papel ADVERTISE ao dono.

## User Scenarios & Testing

### User Story 1 — Criar campanha de Formulário com permissão concedida (P1)

Um usuário com a conexão Meta contendo `pages_manage_ads` cria uma campanha de Formulário no wizard.
O sistema cria o `leadgen_forms` na Página selecionada com nome/email/telefone e botão WhatsApp, e
depois cria campanha, adset e criativo normalmente.

**Why this priority**: é o caminho feliz — sem ele nenhum usuário publica campanha de leads.

**Independent Test**: `createCampaignFromWizard` com objetivo `leads` e token com a permissão
cria o form com `business_phone_number` normalizado e completa campanha/adset/criativo.

**Acceptance Scenarios**:
1. **Given** uma conexão Meta com `pages_manage_ads` concedida, **When** o wizard publica uma
   campanha de Formulário, **Then** o `leadgen_forms` é criado ANTES da campanha e o payload contém
   nome/email/telefone + `thank_you_page` com botão WhatsApp.
2. **Given** o número informado é nacional, **When** o form é montado, **Then** o
   `business_phone_number` recebe DDI 55 sem duplicar.
3. **Given** a criação do form falha, **When** o wizard reporta o erro, **Then** o passo é
   `lead_form` e nenhuma campanha/adset/criativo é criado no Meta (fail-fast + rollback).

### User Story 2 — Erro de permissão no Formulário orienta reconexão com a permissão correta (P1)

Ao criar uma campanha de Formulário, o Meta responde OAuthException sem a permissão de criação.
O usuário deve ver uma mensagem que aponta a permissão correta e o botão "Reconectar Meta" que
refaz o OAuth **forçando a re-exibição das permissões** (`auth_type=rerequest`).

**Why this priority**: sem o `rerequest`, o Login Dialog omite permissões já declinadas e o token
novo nasce sem a permissão — é a causa direta de "reconectei e o erro persiste".

**Independent Test**: chamada `GET /api/meta/auth/url?rerequest=true` gera URL OAuth com
`auth_type=rerequest` e scope contendo `pages_manage_ads`.

**Acceptance Scenarios**:
1. **Given** o Meta recusa a criação do Formulário por permissão, **When** o wizard mapeia o erro,
   **Then** o erro é `META_PERMISSION_DENIED` e a mensagem cita `pages_manage_ads`.
2. **Given** o erro de permissão visível no Step 5, **When** o usuário clica "Reconectar Meta",
   **Then** o frontend chama `/meta/auth/url` com `context=settings`, `rerequest=true` e
   `frontendUrl` = origem atual.
3. **Given** a reconexão é iniciada com `rerequest`, **When** a URL de OAuth é montada, **Then**
   ela contém `auth_type=rerequest` e o scope inclui `pages_manage_ads`, `pages_manage_metadata` e
   `leads_retrieval`.
4. **Given** o fluxo é iniciado SEM `rerequest` (onboarding), **When** a URL é montada, **Then**
   ela NÃO contém `auth_type` (compatibilidade byte-idêntica).

### User Story 3 — Page access token na criação do Formulário (admin direto e via Business Manager) (P1)

Antes de criar o `leadgen_forms`, o wizard obtém o **Page access token** da Página selecionada via
`/me/accounts` (que devolve token + `tasks` tanto para admin direto quanto para páginas acessadas
via Business Manager — requer `business_management`, já no OAuth). O form é criado com esse token.

**Why this priority**: a doc Lead Ads exige um Page access token de quem performa a task ADVERTISE
na Página. Usar o user token era a causa do "reconectei e o erro persiste" quando a pessoa não tinha
acesso adequado na Página.

**Independent Test**: `createCampaignFromWizard` com objetivo `leads` usa o token retornado por
`getPageAccessToken` no `createLeadForm` (não o user token da conexão).

**Acceptance Scenarios**:
1. **Given** o usuário é admin da Página, **When** o wizard publica o Formulário, **Then** o
   `createLeadForm` recebe o Page token (não o user token) e o form é criado.
2. **Given** o usuário acessa a Página via Business Manager com task ADVERTISE, **When** o wizard
   publica, **Then** o `/me/accounts` devolve o token e o fluxo funciona igual (mesma fonte).
3. **Given** o usuário não tem papel na Página (nem direto nem via BM), **When** o wizard tenta
   publicar, **Then** retorna `META_PAGE_NOT_MANAGED` e nada é criado no Meta.
4. **Given** o usuário tem acesso à Página mas sem task `ADVERTISE` (ex.: Analyst), **When** o wizard
   tenta publicar, **Then** retorna `META_PAGE_ADVERTISE_TASK_REQUIRED` e nada é criado.
5. **Given** a criação do form falha após a campanha/adset, **When** o rollback roda, **Then** o
   `archiveLeadForm` usa o MESMO Page token da criação.

### User Story 4 — Integrações avisa quando falta a permissão do Formulário (P2)

A tela Configurações → Integrações deve exibir o banner de reconexão quando faltar `pages_manage_ads`
ou `leads_retrieval`, além dos scopes atuais.

**Why this priority**: hoje o banner só cobre 4 scopes e não cobre a permissão que destrava o
Formulário — o usuário não é avisado na origem.

**Independent Test**: `REQUIRED_SCOPES` inclui `pages_manage_ads` e `leads_retrieval`.

**Acceptance Scenarios**:
1. **Given** a conexão existe, **When** os scopes retornados não incluem `pages_manage_ads`,
   **Then** o banner "Reconecte sua conta Meta" é exibido.
2. **Given** a conexão existe, **When** os scopes incluem todas as exigidas, **Then** o banner não é
   exibido.

### User Story 5 — Política de privacidade obrigatória no Formulário (P1)

A Meta passou a exigir `privacy_policy` (url + link_text) **ou** `legal_content_id` na criação do
`leadgen_forms` (code 100 / subcode 1892075 *"Legal content missing"*). O wizard envia
`privacy_policy` apontando para uma **página pública de política de privacidade** do anunciante,
servida server-side (como a LP) com o nome da organização substituído.

**Why this priority**: sem esse campo, a criação do Formulário falha com 400 — é bloqueante para o
objetivo `leads`.

**Independent Test**: `createCampaignFromWizard` envia `privacy_policy.url` =
`https://app.useady.com.br/privacidade/<slug>` e `link_text` = "Política de Privacidade".

**Acceptance Scenarios**:
1. **Given** o wizard publica um Formulário, **When** o `leadgen_forms` é montado, **Then** o body
   contém `privacy_policy` com URL pública e `link_text` ≤ 70 caracteres.
2. **Given** a organização tem nome, **When** a URL é montada, **Then** o slug deriva do nome
   (`slugify`), com fallback para `tenants.slug` e depois `tenantId`.
3. **Given** um visitante acessa `GET /privacidade/:slug`, **When** o tenant existe, **Then** recebe
   HTML da política de privacidade com o nome da organização substituído no template padrão.
4. **Given** o tenant não existe, **When** acessa `GET /privacidade/:slug`, **Then** recebe 404.
5. **Given** o Meta responde subcode 1892075, **When** o mapeador trata o passo `lead_form`, **Then**
   retorna `META_LEGAL_CONTENT_REQUIRED` com mensagem clara.

### User Story 6 — Criativo do Formulário exige o campo link (https://fb.me/) (P1)

O `link_data` do criativo de Formulário (objetivo `leads`) deve incluir o campo `link` — a doc
Lead Ads exige `https://fb.me/` como valor reservado (o clique real abre o form via
`call_to_action.lead_gen_form_id`). Sem o campo, o Meta rejeita com subcode 2061015
*"Required field is missing: the link field is required"*.

**Why this priority**: é o erro em produção após a correção da política de privacidade — bloqueia a
criação do criativo do Formulário.

**Independent Test**: `createCampaignFromWizard` com objetivo `leads` monta `link_data` com
`link: 'https://fb.me/'` e `call_to_action` SIGN_UP com `lead_gen_form_id`.

**Acceptance Scenarios**:
1. **Given** o wizard publica um Formulário, **When** o criativo é montado, **Then** o `link_data`
   contém `link: 'https://fb.me/'`.
2. **Given** o criativo é de Formulário, **When** o `link_data` é montado, **Then** o `call_to_action`
   é `SIGN_UP` com `value.lead_gen_form_id` (não um link externo).
3. **Given** o Meta responde subcode 2061015, **When** o mapeador trata o passo `creative`, **Then**
   retorna `META_LINK_REQUIRED`.

### User Story 7 — Página dedicada de Leads com filtro por campanha de Formulário (P1)

Leads coletados pelos formulários ficam disponíveis em uma página dedicada (acessível pela sidebar),
com filtro por campanha. O filtro lista **somente campanhas do objetivo Formulário**
(`OUTCOME_LEADS`) — as demais não geram dados de formulário. O padrão é "Todas as campanhas"
(visão agregada), com opção de filtrar por uma campanha específica. O modal de leads no painel de
campanhas é removido (a página dedicada substitui).

**Why this priority**: a visualização de leads dentro da tabela de campanhas era estética e
funcionalmente pobre (modal apertado, sem filtro agregado). A página dedicada centraliza a consulta.

**Independent Test**: `GET /campaigns/leads` retorna os leads agregados de todas as campanhas
`OUTCOME_LEADS` com `campaignId`/`campaignName`; a página `LeadsPage` filtra o dropdown por
campanhas de Formulário e busca `GET /campaigns/:id/leads` ao selecionar uma.

**Acceptance Scenarios**:
1. **Given** o usuário acessa a sidebar, **When** clica em "Leads", **Then** é levado a `/leads`.
2. **Given** a página abre sem seleção, **When** os leads carregam, **Then** exibe a visão "Todas as
   campanhas" com a coluna **Campanha** ao lado de Nome/E-mail/Telefone/Data.
3. **Given** existem campanhas de vários objetivos, **When** o dropdown de filtro é aberto, **Then**
   aparecem apenas as campanhas `OUTCOME_LEADS` (exclui tráfego/engajamento etc.).
4. **Given** o usuário seleciona uma campanha no filtro, **When** a seleção muda, **Then** a página
   busca `GET /campaigns/:id/leads` e esconde a coluna Campanha.
5. **Given** não existem campanhas de Formulário, **When** a página carrega, **Then** exibe o estado
   vazio "Nenhuma campanha de Formulário".
6. **Given** a campanha de Formulário existe mas não tem leads, **When** a página carrega, **Then**
   exibe "Nenhum lead ainda".

## Edge Cases

- **Token expirado** (erro 190): mapeado para `META_TOKEN_EXPIRED`, reconexão disponível.
- **Timeout/504**: `META_TIMEOUT`, orienta tentar novamente (não reconectar).
- **Saldo insuficiente**: `META_INSUFFICIENT_FUNDS`.
- **Número de telefone inválido** (code 192): `META_INVALID_PHONE_NUMBER` — sem relação com permissão.
- **Rollback parcial**: leadgen_forms não suporta DELETE; melhor esforço é arquivar (`archiveLeadForm`)
  com o MESMO Page token da criação.
- **Página sem papel** (`/me/accounts` não lista a página): `META_PAGE_NOT_MANAGED` — o usuário precisa
  de acesso direto ou via BM; reconectar o OAuth não resolve.
- **Página sem task ADVERTISE**: `META_PAGE_ADVERTISE_TASK_REQUIRED` — usuário precisa do papel de
  Anunciante/Administrador na Página.
- **Legal content missing** (subcode 1892075): `META_LEGAL_CONTENT_REQUIRED` — a URL da política de
  privacidade não foi aceita pelo Meta; orienta tentar novamente.
- **Link field required** (subcode 2061015): `META_LINK_REQUIRED` — criativo de Formulário sem o
  campo `link` no `link_data`; o wizard envia `https://fb.me/` (valor reservado da doc Lead Ads).