# API Contracts: Google Meu Negócio

Todas as rotas sob `/api/google`. Envelope `ApiResponse<T>` (`packages/shared/src/api.ts`). Auth: `Bearer` JWT + `tenantMiddleware` em todas as rotas, **exceto** o callback OAuth (público, resolve tenant via `state` JWT assinado — padrão Meta). Erros via `AppError` → `errorHandler`.

## OAuth

### GET /api/google/auth/url?context=settings

Gera a URL de autorização do Google.

**Auth**: JWT (extrai `tenantId`)

**Response 200**:
```json
{
  "success": true,
  "data": {
    "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=http://localhost:3000/api/google/auth/callback&scope=https://www.googleapis.com/auth/business.manage&state=eyJ..."
  },
  "timestamp": "2026-08-17T18:00:00.000Z"
}
```

**Response 400** (`context` inválido): `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }`

**Response 500** (credenciais ausentes): `{ "success": false, "error": { "code": "MISSING_ENV", "message": "Configuração do Google não definida." } }`

### GET /api/google/auth/callback?code=...&state=...

Callback OAuth — **público** (sem auth). Troca `code` por tokens, criptografa e persiste em `google_connections` (upsert), redireciona para o frontend.

**Response**: `302 redirect` para `{FRONTEND_URL}/configuracoes/google-meu-negocio?connected=true`

**Redirect de erro**: `{FRONTEND_URL}/configuracoes/google-meu-negocio?error=oauth_cancelled` | `?error=invalid_state` | `?error=token_exchange_failed`

### GET /api/google/connections

Retorna a conexão atual do tenant (se existir).

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "googleUserId": "102345678901234567890",
    "accountId": "accounts/123456",
    "accountName": "Minha Empresa Ltda",
    "tokenExpiresAt": "2026-08-17T19:00:00.000Z",
    "connected": true
  },
  "timestamp": "2026-08-17T18:00:00.000Z"
}
```

**Response 200** (sem conexão): `{ "success": true, "data": null, ... }`

### DELETE /api/google/connections/:id

Desconecta: revoga acesso na Google (`POST https://oauth2.googleapis.com/revoke`), remove conexão + perfis espelhados (cascade), mantém `business_profile_settings` (dados do negócio não dependem do Google).

**Response 200**: `{ "success": true, "data": { "id": "uuid", "disconnected": true }, ... }`

**Response 404** (conexão de outro tenant): `{ "success": false, "error": { "code": "NOT_FOUND", "message": "Conexão não encontrada." } }`

## Lookup de perfil existente

### GET /api/google/lookup

Verifica se já existe perfil no Google para o negócio do tenant (usa `business_profile_settings` + `googleLocations:search`). Atende FR-002/FR-011.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "found": true,
    "matches": [
      {
        "gbpLocationId": "accounts/123456/locations/789",
        "name": "Minha Empresa Ltda",
        "address": { "street": "Av. Paulista 1000", "city": "São Paulo", "state": "SP", "postalCode": "01310-100", "country": "BR" },
        "phone": "+5511999999999",
        "verificationState": "VERIFIED",
        "claimed": true,
        "confidence": "HIGH"
      }
    ],
    "duplicateAlert": false
  },
  "timestamp": "2026-08-17T18:00:00.000Z"
}
```

**Response 200** (não encontrado): `{ "success": true, "data": { "found": false, "matches": [], "duplicateAlert": false }, ... }`

**Response 200** (duplicado sugerido — FR-011): `{ "success": true, "data": { "found": false, "matches": [...], "duplicateAlert": true }, ... }`

**Response 401** (token expirado): `{ "success": false, "error": { "code": "GOOGLE_TOKEN_EXPIRED", "message": "Sua conexão com o Google expirou. Reconecte para continuar." } }`

## Contas e categorias

### GET /api/google/accounts

Lista contas de negócio do usuário na GBP (`GET /v4/accounts`) e grava `accountId` selecionada.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "accounts": [
      { "accountId": "accounts/123456", "accountName": "Minha Empresa Ltda" }
    ],
    "selectedAccountId": "accounts/123456"
  },
  "timestamp": "2026-08-17T18:00:00.000Z"
}
```

### GET /api/google/categories?query=padaria

Autocomplete de categorias do catálogo oficial da GBP (FR-012).

**Response 200**:
```json
{
  "success": true,
  "data": {
    "categories": [
      { "categoryId": "gcid:bakery", "displayName": "Padaria", "parentId": null }
    ]
  },
  "timestamp": "2026-08-17T18:00:00.000Z"
}
```

**Response 422** (categoria inexistente na criação): `{ "success": false, "error": { "code": "INVALID_CATEGORY", "message": "A categoria selecionada não existe no catálogo do Google." } }`

## Dados do negócio (Configurações — FR-007)

### GET /api/google/settings

Retorna `business_profile_settings`, pré-preenchido de `tenants.name` + `tenants.businessContext` quando nunca salvo.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "name": "Minha Empresa Ltda",
    "address": { "street": "", "city": "", "state": "", "postalCode": "", "country": "BR" },
    "phone": "",
    "email": "contato@empresa.com.br",
    "website": "",
    "categoryId": null,
    "hours": null,
    "prefilledFrom": ["tenant.name", "tenant.businessContext"]
  },
  "timestamp": "2026-08-17T18:00:00.000Z"
}
```

### PUT /api/google/settings

Salva os dados do negócio. **Fonte primária** para criação/atualização do perfil.

**Request Body** (Zod):
```json
{
  "name": "Minha Empresa Ltda",
  "address": { "street": "Av. Paulista 1000", "city": "São Paulo", "state": "SP", "postalCode": "01310-100", "country": "BR" },
  "phone": "+5511999999999",
  "email": "contato@empresa.com.br",
  "website": "https://empresa.com.br",
  "categoryId": "gcid:bakery",
  "hours": { "monday": [{ "open": "08:00", "close": "18:00" }] }
}
```

**Response 200**: `{ "success": true, "data": { "id": "uuid", "name": "Minha Empresa Ltda" }, ... }`

**Response 400** (campos obrigatórios): `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Endereço e telefone são obrigatórios.", "details": { "fields": ["address", "phone"] } } }`

**Response 422** (categoria inválida): `{ "success": false, "error": { "code": "INVALID_CATEGORY", "message": "..." } }`

## Perfil (US2/US3)

### POST /api/google/profiles

Cria perfil na GBP API com os dados de `business_profile_settings`. Bloqueado se `lookup` indicar duplicado com confiança alta (FR-011).

**Response 201**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "gbpLocationId": "accounts/123456/locations/789",
    "name": "Minha Empresa Ltda",
    "syncStatus": "awaiting_verification",
    "verificationState": "UNVERIFIED",
    "created": true
  },
  "timestamp": "2026-08-17T18:00:00.000Z"
}
```

**Response 409** (duplicado — sugerir reivindicação): `{ "success": false, "error": { "code": "DUPLICATE_LOCATION", "message": "Já existe um perfil para este endereço no Google. Deseja reivindicá-lo?", "details": { "matches": [{ "gbpLocationId": "accounts/123456/locations/789", "confidence": "HIGH" }] } } }`

**Response 422** (GBP recusa criação — país/verificação): `{ "success": false, "error": { "code": "GBP_CREATION_NOT_SUPPORTED", "message": "O Google não permite criar o perfil automaticamente. Vamos orientar a criação manual.", "details": { "reason": "..." } } }`

**Response 400** (dados do negócio incompletos): `{ "success": false, "error": { "code": "BUSINESS_SETTINGS_INCOMPLETE", "message": "Preencha os dados do negócio antes de criar o perfil." } }`

### GET /api/google/profiles

Retorna o perfil espelhado do tenant (se existir).

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "gbpLocationId": "accounts/123456/locations/789",
    "name": "Minha Empresa Ltda",
    "address": { "street": "Av. Paulista 1000", "city": "São Paulo", "state": "SP", "postalCode": "01310-100", "country": "BR" },
    "phone": "+5511999999999",
    "email": "contato@empresa.com.br",
    "website": "https://empresa.com.br",
    "categoryId": "gcid:bakery",
    "categoryDisplayName": "Padaria",
    "hours": { "monday": [{ "open": "08:00", "close": "18:00" }] },
    "photos": ["https://r2.public.url/foto1.jpg"],
    "verificationState": "VERIFIED",
    "syncStatus": "verified",
    "lastSyncedAt": "2026-08-17T17:58:00.000Z"
  },
  "timestamp": "2026-08-17T18:00:00.000Z"
}
```

**Response 200** (sem perfil): `{ "success": true, "data": null, ... }`

### PATCH /api/google/profiles/:id

Atualiza campos editáveis (nome, endereço, telefone, email, site, categoria, horário) na GBP API. `syncStatus` → `syncing` até confirmação. Dados vindos da GBP, não locais (US3).

**Request Body** (parcial, Zod):
```json
{ "hours": { "monday": [{ "open": "09:00", "close": "17:00" }] } }
```

**Response 200**:
```json
{
  "success": true,
  "data": { "id": "uuid", "syncStatus": "syncing", "updated": true },
  "timestamp": "2026-08-17T18:05:00.000Z"
}
```

**Response 409** (Google rejeita — ex. endereço inválido): `{ "success": false, "error": { "code": "GBP_UPDATE_REJECTED", "message": "O Google rejeitou a atualização: endereço inválido.", "details": { "reason": "..." } } }`

### POST /api/google/profiles/:id/sync

Dispara sync imediato (on-demand) do perfil com a GBP.

**Response 200**: `{ "success": true, "data": { "id": "uuid", "syncStatus": "verified", "lastSyncedAt": "..." }, ... }`

## Verificação (US2)

### GET /api/google/profiles/:id/verification

Status de verificação + métodos elegíveis (`fetchVerificationOptions`).

**Response 200**:
```json
{
  "success": true,
  "data": {
    "verificationState": "UNVERIFIED",
    "options": [
      { "method": "POSTAL", "description": "Enviar cartão postal para o endereço comercial" },
      { "method": "PHONE", "description": "Verificar por telefone" },
      { "method": "EMAIL", "description": "Verificar por email" }
    ],
    "instructions": "Instruções oficiais da Google para concluir a verificação."
  },
  "timestamp": "2026-08-17T18:00:00.000Z"
}
```

### POST /api/google/profiles/:id/verification/complete

Conclui verificação por telefone/email (envia PIN) quando o método permite; caso contrário orienta cartão postal (o Ady apenas acompanha status).

**Request Body**: `{ "method": "EMAIL" }`

**Response 200**: `{ "success": true, "data": { "verificationState": "UNVERIFIED", "awaitingPin": true }, ... }`

**Response 200** (após PIN): `{ "success": true, "data": { "verificationState": "VERIFIED", "syncStatus": "verified" }, ... }`

## Fotos (FR-006 — associação manual)

### POST /api/google/profiles/:id/photos (multipart/form-data, campo `photo`)

Upload **local** via `storage.service.ts` (R2) + associação manual. **NUNCA** publica na GBP API.

**Response 200**:
```json
{
  "success": true,
  "data": { "photos": ["https://r2.public.url/foto1.jpg"], "associatedManually": true },
  "timestamp": "2026-08-17T18:00:00.000Z"
}
```

### DELETE /api/google/profiles/:id/photos?url=...

Remove associação da foto (e deleta do R2 via `deleteAsset`).

**Response 200**: `{ "success": true, "data": { "photos": [] }, ... }`

## Status e histórico (US5)

### GET /api/google/profiles/:id/sync-logs?limit=50

Histórico de operações do perfil.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "logs": [
      { "id": "uuid", "operation": "verify", "status": "success", "message": "Perfil verificado pelo Google.", "createdAt": "2026-08-17T17:55:00.000Z" },
      { "id": "uuid", "operation": "create", "status": "success", "message": "Perfil criado. Aguardando verificação.", "createdAt": "2026-08-16T10:00:00.000Z" }
    ]
  },
  "timestamp": "2026-08-17T18:00:00.000Z"
}
```

## Resumo de endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/google/auth/url` | JWT | URL de autorização OAuth |
| GET | `/api/google/auth/callback` | público | Callback OAuth → redirect frontend |
| GET | `/api/google/connections` | JWT+tenant | Conexão atual |
| DELETE | `/api/google/connections/:id` | JWT+tenant | Desconectar |
| GET | `/api/google/lookup` | JWT+tenant | Perfil existente / duplicado |
| GET | `/api/google/accounts` | JWT+tenant | Contas de negócio GBP |
| GET | `/api/google/categories` | JWT+tenant | Autocomplete categorias |
| GET | `/api/google/settings` | JWT+tenant | Dados do negócio |
| PUT | `/api/google/settings` | JWT+tenant | Salvar dados do negócio |
| POST | `/api/google/profiles` | JWT+tenant | Criar perfil |
| GET | `/api/google/profiles` | JWT+tenant | Perfil espelhado |
| PATCH | `/api/google/profiles/:id` | JWT+tenant | Atualizar perfil |
| POST | `/api/google/profiles/:id/sync` | JWT+tenant | Sync on-demand |
| GET | `/api/google/profiles/:id/verification` | JWT+tenant | Status/opções de verificação |
| POST | `/api/google/profiles/:id/verification/complete` | JWT+tenant | Concluir verificação |
| POST | `/api/google/profiles/:id/photos` | JWT+tenant | Upload local (R2) + associação |
| DELETE | `/api/google/profiles/:id/photos` | JWT+tenant | Remover foto |
| GET | `/api/google/profiles/:id/sync-logs` | JWT+tenant | Histórico |

## Códigos de erro

| Código | Status | Significado |
|--------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Zod validation |
| `MISSING_ENV` | 500 | Credenciais Google não configuradas |
| `GOOGLE_TOKEN_EXPIRED` | 401 | Refresh falhou → reconectar |
| `INVALID_OAUTH_STATE` | 401 | `state` JWT inválido/expirado |
| `NOT_FOUND` | 404 | Conexão/perfil de outro tenant |
| `BUSINESS_SETTINGS_INCOMPLETE` | 400 | Falta dados do negócio para criar |
| `DUPLICATE_LOCATION` | 409 | Perfil duplicado → reivindicação |
| `GBP_CREATION_NOT_SUPPORTED` | 422 | GBP não permite criação direta → orientar manual |
| `GBP_UPDATE_REJECTED` | 409 | Google rejeitou atualização |
| `INVALID_CATEGORY` | 422 | Categoria fora do catálogo oficial |
| `FORBIDDEN` | 403 | Tenant context ausente |