# FURY API - Exemplos de Autenticação

Este documento fornece exemplos de como testar os endpoints de autenticação do FURY.

## Pré-requisitos

1. **Certifique-se de que o servidor está rodando:**
   ```bash
   npm run dev --workspace=@fury/api
   ```

2. **Banco de dados e Redis devem estar rodando:**
   ```bash
   # PostgreSQL deve estar acessível em: postgresql://fury:fury_local@localhost:5432/fury_dev
   # Redis deve estar acessível em: redis://localhost:6379
   ```

3. **Arquivo `.env` deve estar configurado** na raiz do projeto com as variáveis JWT_SECRET e JWT_REFRESH_SECRET.

---

## 1. POST /api/auth/register

Cria um novo tenant e registra o primeiro usuário como owner.

### Request
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@furyapp.io",
    "password": "senhaForte123!@#",
    "companyName": "Fury Automação LTDA"
  }'
```

### Response (201 Created)
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "joao@furyapp.io",
      "role": "owner",
      "tenantId": "223e4567-e89b-12d3-a456-426614174000",
      "createdAt": "2026-04-29T12:30:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  },
  "timestamp": "2026-04-29T12:30:00.000Z"
}
```

### Erros
- **409 Conflict**: Email já cadastrado
- **400 Bad Request**: Validação falhou (nome, email ou senha inválidos)

---

## 2. POST /api/auth/login

Autentica um usuário e retorna novos tokens.

### Request
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@furyapp.io",
    "password": "senhaForte123!@#"
  }'
```

### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "joao@furyapp.io",
      "role": "owner",
      "tenantId": "223e4567-e89b-12d3-a456-426614174000",
      "createdAt": "2026-04-29T12:30:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  },
  "timestamp": "2026-04-29T12:30:00.000Z"
}
```

### Erros
- **401 Unauthorized**: Email ou senha inválidos
- **400 Bad Request**: Validação falhou

---

## 3. GET /api/auth/me

Retorna dados do usuário autenticado. **Requer autenticação**.

### Request
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "joao@furyapp.io",
    "role": "owner",
    "tenantId": "223e4567-e89b-12d3-a456-426614174000",
    "createdAt": "2026-04-29T12:30:00.000Z"
  },
  "timestamp": "2026-04-29T12:30:00.000Z"
}
```

### Erros
- **401 Unauthorized**: Token ausente, inválido ou expirado
- **401 Token Expired**: Access token expirou (use /refresh)

---

## 4. POST /api/auth/refresh

Gera novos tokens usando o refresh token (válido por 30 dias).

### Request
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  },
  "timestamp": "2026-04-29T12:30:00.000Z"
}
```

### Notas Importantes
- O **refresh token antigo é revogado** automaticamente
- Se o refresh token expirou (>30 dias), será retornado 401
- Se o refresh token foi revogado (logout), será retornado 401

### Erros
- **401 Unauthorized**: Refresh token inválido ou revogado
- **401 Token Expired**: Refresh token expirou
- **400 Bad Request**: Validação falhou

---

## 5. POST /api/auth/logout

Invalida o refresh token do usuário. **Requer autenticação**.

### Request
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Response (200 OK)
```json
{
  "success": true,
  "data": null,
  "timestamp": "2026-04-29T12:30:00.000Z"
}
```

### Notas Importantes
- Após logout, o refresh token **não poderá mais ser usado**
- O access token continua válido até expirar (15 minutos)
- Para re-autenticar, use `/login` novamente

### Erros
- **401 Unauthorized**: Token ausente ou inválido

---

## 6. GET /api/health

Verifica o status do servidor (público, sem autenticação).

### Request
```bash
curl http://localhost:3000/api/health
```

### Response (200 OK)
```json
{
  "status": "ok",
  "timestamp": "2026-04-29T12:30:00.000Z",
  "uptime": 123.456
}
```

---

## Fluxo Completo de Autenticação

### 1. Registro
```bash
# Registra novo usuário e obtém tokens
REGISTER_RESPONSE=$(curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Usuário Teste",
    "email": "teste@fury.io",
    "password": "senhaForte123!",
    "companyName": "Empresa Teste"
  }')

# Extrai os tokens (requer jq)
ACCESS_TOKEN=$(echo $REGISTER_RESPONSE | jq -r '.data.tokens.accessToken')
REFRESH_TOKEN=$(echo $REGISTER_RESPONSE | jq -r '.data.tokens.refreshToken')
```

### 2. Usar Access Token
```bash
# Access token é válido por 15 minutos
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 3. Renovar Tokens (após 15 min)
```bash
# Refresh token é válido por 30 dias
REFRESH_RESPONSE=$(curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")

# Novo access token
ACCESS_TOKEN=$(echo $REFRESH_RESPONSE | jq -r '.data.tokens.accessToken')
REFRESH_TOKEN=$(echo $REFRESH_RESPONSE | jq -r '.data.tokens.refreshToken')
```

### 4. Logout
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## Estrutura de Erros

Todos os erros seguem este padrão:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensagem descritiva do erro"
  },
  "timestamp": "2026-04-29T12:30:00.000Z"
}
```

### Códigos de Erro Comuns
- `UNAUTHORIZED` (401): Token ausente, inválido ou expirado
- `TOKEN_EXPIRED` (401): Access token expirou
- `INVALID_CREDENTIALS` (401): Email ou senha inválidos
- `EMAIL_EXISTS` (409): Email já cadastrado
- `VALIDATION_ERROR` (400): Dados de entrada inválidos
- `INVALID_TOKEN` (401): Token JWT inválido
- `INVALID_REFRESH_TOKEN` (401): Refresh token inválido ou revogado
- `USER_NOT_FOUND` (401): Usuário não encontrado
- `INTERNAL_SERVER_ERROR` (500): Erro interno do servidor

---

## Notas de Segurança

1. **Senhas**: Hasheadas com bcrypt (salt rounds: 12)
2. **Access Tokens**: Expiram em 15 minutos, stored client-side
3. **Refresh Tokens**: 
   - Expiram em 30 dias
   - Hash armazenado em Redis (não o token bruto)
   - Revogados automaticamente no logout ou ao fazer refresh
4. **HTTPS Recomendado**: Em produção, usar HTTPS e adicionar secure flags aos cookies
5. **Erros Genéricos**: Login retorna erro genérico (não revela se email existe)

---

## Variáveis de Ambiente

```env
# Banco de dados
DATABASE_URL=postgresql://fury:fury_local@localhost:5432/fury_dev

# Redis
REDIS_URL=redis://localhost:6379

# JWT - use valores de pelo menos 32 caracteres em produção
JWT_SECRET=your_secret_key_min_32_chars_required_123456
JWT_REFRESH_SECRET=your_refresh_secret_key_min_32_chars_required_123456

# Servidor
PORT=3000
NODE_ENV=development
```

---

## Troubleshooting

### Erro: "ECONNREFUSED" ao conectar ao banco
- Certifique-se de que PostgreSQL está rodando
- Verifique se DATABASE_URL está correto
- Execute as migrações: `npm run migrate --workspace=@fury/db`

### Erro: "ECONNREFUSED" ao conectar ao Redis
- Certifique-se de que Redis está rodando
- Verifique se REDIS_URL está correto
- Padrão: `redis://localhost:6379`

### Erro: "Invalid token" no /api/auth/me
- Certifique-se de que o token tem o prefixo `Bearer `
- Verifique se o token não expirou (15 minutos)
- Use `/api/auth/refresh` para obter um novo token

### Erro: "Email already registered"
- O email já existe no banco
- Use outro email ou faça login se já tem uma conta
