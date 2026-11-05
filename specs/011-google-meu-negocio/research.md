# Research: Google Meu Negócio (Google Business Profile)

**Phase 0 output** — decisões técnicas e resolução de clarificações (Q1–Q5 do spec).

## Decision Log

### 1. Dependência da GBP API: aprovação de acesso (allowlist) — pré-requisito de projeto

- **Decision**: Criar projeto no Google Cloud, habilitar Business Profile API e **solicitar acesso via formulário oficial** antes de qualquer código de produção. Em dev/test, `GOOGLE_API_MOCK=true` (padrão `META_API_MOCK`).
- **Rationale**: A GBP API (base `https://mybusiness.googleapis.com/v4`) exige, além do OAuth Consent Screen, um pedido de acesso por formulário com requisitos reais: perfil GBP verificado e ativo há 60+ dias + website do negócio. Sem aprovação a quota é **0 QPM** (o pedido é rejeitado); aprovado, sobe para **300 QPM**. Isso é bloqueante de ambiente, não de código — o spec já diz "integração precisa ser criada do zero".
- **Alternatives Considered**: API key — não existe para esta API; OAuth 2.0 com escopo `business.manage` é obrigatório. Service account — não aplicável para fluxo "conta do cliente" (funciona só para organização própria, ver forum Google, jun 2025).

### 2. Q1 — "Patrocinado" (FR-008): Google Ads com extensões de localização, fora do MVP

- **Decision**: Patrocinado = **Google Ads com extensão de localização** apontando para o `gbpLocationId` do perfil verificado. **Fase 2 (fora do MVP)**: no MVP entrega-se apenas o gate de elegibilidade (perfil `verified`) + botão que redireciona o cliente para configurar a campanha no Google Ads. O **cliente paga direto ao Google** — o Ady nunca processa pagamento do patrocinado.
- **Rationale**: É o que o spec clarificou (FR-008: "Google Ads com extensões de localização"). A integração com Google Ads API (`googleads.googleapis.com/v18`) é um sistema separado com billing próprio — adicioná-la ao MVP violaria V. Simplicity & YAGNI e atrasaria as US P1 (conexão, criação, gerenciamento).
- **Alternatives Considered**: Local Services Ads — produto separado, exige licenças/seguros por categoria, fora de escopo. Selo "Google Guaranteed" — produto de confiança, não um anúncio; não configura via API padrão.

### 3. Q2 — Criação de perfil (FR-003): via API com fallback para orientação manual

- **Decision**: Tentar `POST /v4/{parent=accounts/*}/locations` com os dados do `business_profile_settings`. Se a API rejeitar a criação (país não suportado, verificação obrigatória, `ALREADY_EXISTS`), **orientar reivindicação** via `POST /v4/{parent=accounts/*}/googleLocations:search` (detecta o perfil existente no Maps) + instruções de verificação. O Ady acompanha o status via `locations.verifications.list` até `VERIFIED`.
- **Rationale**: A GBP API suporta criação programática de locations (guide "Create a new location, handle verifications directly through the APIs"), mas com restrições regionais. O fallback orientado cobre os edge cases do spec ("perfil já existente criado por terceiros" → sugerir reivindicação; "verificação exigida" → orientar).
- **Alternatives Considered**: Bloquear criação quando a API recusa — piora a experiência e não entrega FR-003.

### 4. Q3 — Fotos (FR-006): armazenar localmente, NUNCA publicar na GBP API

- **Decision**: Upload via `storage.service.ts` (Cloudflare R2, bucket `fury-studio-assets`); URLs persistidas em `photos` (jsonb) do perfil espelhado e associadas **manualmente** na interface. Zero chamadas a `media.create`/`startUpload` da GBP API.
- **Rationale**: Clarificado no spec (FR-006: "Fotos são armazenadas localmente no Ady... NÃO publica fotos na GBP API"). Publicar na GBP exigiria o fluxo `media.startUpload` (upload chunked) + aprovação de escopo adicional — sem valor para o MVP declarado.

### 5. Q4 — Notificações: email + painel de status; WhatsApp fora do MVP

- **Decision**: Transições de status notificam por **email** (`email.service.ts`) e ficam visíveis no **painel de status** (página `google-meu-negocio` + `google_sync_logs`). WhatsApp **adiado**.
- **Rationale**: Não existe tabela/canal de notificação in-app hoje (grep por `notification` em services só acha `notificationPrefs` de usuário). Adicionar WhatsApp = nova infraestrutura de mensageria — viola V. Simplicity para o MVP. O painel de status + histórico já entrega o requisito de transparência (US5).
- **Alternatives Considered**: Tabela `in_app_notifications` nova — pode surgir em PR próprio quando o Ady tiver central de notificações; não criar só para esta feature.

### 6. Q5 — Onde fica a aba: página dedicada `/configuracoes/google-meu-negocio`

- **Decision**: **Página dedicada** seguindo o padrão de `/configuracoes/integracoes` (rota própria com `AppLayout` + `ErrorBoundary`), NÃO uma tab nova no `Configuracoes.tsx`.
- **Rationale**: As tabs atuais (`geral`, `seguranca`, `faturamento`, `publico`, `metas`) são formulários simples; `Integracoes` já estabeleceu o padrão de página para integração com OAuth. A feature tem 5 responsabilidades (conexão, formulário do negócio, lookup, gerenciamento de perfil, status) — uma página dedicada escala melhor. `ConfiguracoesTabsNav` não muda; o link entra no corpo da página de Configurações (como `Integracoes`).
- **Alternatives Considered**: Tab `google-meu-negocio` no `Configuracoes.tsx` — exigiria manter 600+ linhas de tabs + sub-estados da feature no mesmo arquivo.

### 7. Token refresh silencioso (FR-010) — access token expira em ~1h

- **Decision**: `google_connections` guarda **`refreshToken`** (criptografado) além de `accessToken` + `tokenExpiresAt`. `lib/google-api.ts` renova silenciosamente via `POST https://oauth2.googleapis.com/token` (`grant_type=refresh_token`) quando `tokenExpiresAt` próximo do limite (janela de 5 min), espelhando o fluxo de troca de code. Falha de refresh → `AppError(401, 'GOOGLE_TOKEN_EXPIRED')` → frontend orienta reconexão preservando dados preenchidos.
- **Rationale**: Diferença crítica vs Meta: tokens do Facebook duram 60 dias e o padrão existente não guarda refresh; tokens do Google duram ~1h (padrão OAuth 2.0 da Google). Sem refresh_token, SC-001 ("verificação em < 30s") quebra a cada hora.
- **Alternatives Considered**: Reautenticar manual a cada expiração — UX inaceitável; ignorar expiração — chamadas 401.

### 8. Detecção de duplicado (FR-011) — `googleLocations:search`

- **Decision**: Antes de criar perfil, o Ady chama `POST /v4/{parent=accounts/*}/googleLocations:search` com `name` + `address` do negócio. Resultados com `locationState` indicando perfil já existente (incl. criado por terceiros) → **alertar e sugerir reivindicação** em vez de criar outro. Criação bloqueada quando o match tem confiança alta.
- **Rationale**: Implementa FR-011 + edge case "endereço corresponde a perfil já existente". A busca é o mecanismo oficial do Google para isso (guide "Search for matching listings").

### 9. Validação de categoria (FR-012) — catálogo oficial via API

- **Decision**: Validação no **backend** contra o catálogo de categorias da GBP (Business Information API) com autocomplete + sugestões no frontend. `categoryId` persistido; `categoryDisplayName` como fallback de exibição.
- **Rationale**: FR-012 exige validação contra o catálogo oficial. No frontend o catálogo é grande (~4.500 categorias) — autocomplete com debounce no servidor, cache curto em memória.

### 10. Estado de verificação e sync — modelagem local

- **Decision**: `google_business_profiles.verificationState` espelha o campo `verificationState` da Location (`UNVERIFIED` | `VERIFIED`) e `syncStatus` agrega o estado de integração do Ady: `not_connected` | `connected` | `no_profile` | `awaiting_verification` | `verified` | `syncing` | `error` (FR-005). Um job BullMQ `repeat` (padrão `publish-due-manager`, `* * * * *`) sincroniza perfis em `awaiting_verification`/`syncing` e dispara notificação de email nas transições.
- **Rationale**: Transições passivas (verificação concluída pela Google) não são observáveis por request — precisam de sync agendado. Reusar a fila BullMQ existente evita nova infra (V. Simplicity).

## Mapa Spec → Decisões

| Spec | Decisão |
|------|---------|
| Q1 / FR-008 (Patrocinado) | Google Ads + extensão de localização, fase 2, cliente paga direto (Decisão 2) |
| Q2 / FR-003 (Criação) | `locations.create` com fallback reivindicação orientada (Decisão 3) |
| Q3 / FR-006 (Fotos) | R2 local + associação manual, zero publicação (Decisão 4) |
| Q4 (Notificações) | Email + painel de status; WhatsApp adiado (Decisão 5) |
| Q5 (Aba) | Página dedicada `/configuracoes/google-meu-negocio` (Decisão 6) |
| FR-010 (Refresh) | `refreshToken` persistido + refresh silencioso (Decisão 7) |
| FR-011 (Duplicado) | `googleLocations:search` + bloqueio de criação (Decisão 8) |
| FR-012 (Categoria) | Catálogo oficial com autocomplete backend (Decisão 9) |
| FR-005 (Status) | `syncStatus` agregado + job BullMQ de sync (Decisão 10) |
| Reviews / Fotos auto | NUNCA respondidos/publicados — limitação explícita, sem endpoints de review (Decisão 4) |

## Referências da GBP API

- Base: `https://mybusiness.googleapis.com/v4` (discovery v1 também serve Business Information)
- OAuth: escopo `https://www.googleapis.com/auth/business.manage`; troca/refresh em `https://oauth2.googleapis.com/token`; access token ~1h
- `GET /v4/accounts` — lista contas de negócio do usuário (p.ex. `accounts/123456`)
- `GET /v4/{parent=accounts/*}/locations` — lista perfis (locations) da conta
- `POST /v4/{parent=accounts/*}/locations` — cria location
- `POST /v4/{parent=accounts/*}/googleLocations:search` — busca perfis existentes (duplicado/reivindicação)
- `GET/PATCH /v4/{name=accounts/*/locations/*}` — ler/atualizar location
- `POST /v4/{name=accounts/*/locations/*}:fetchVerificationOptions` + `POST /v4/{name=...}:verify` + `GET /v4/{parent=accounts/*/locations/*}/verifications` — fluxo de verificação
- Categorias: Business Information API (`accounts.categories.list`) — validação FR-012
- Quota: 0 QPM sem aprovação; 300 QPM após allowlist (https://developers.google.com/my-business/content/prereqs)