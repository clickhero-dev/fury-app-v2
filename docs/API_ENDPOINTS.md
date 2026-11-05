
Referência completa da API da Plataforma de Automação de Tráfego Pago FURY.

**URL Base:** `http://localhost:3000/api`

**Versão da API:** 1.0.0

---

## Índice

- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Autenticação](#autenticação)
- [Endpoints de Autenticação](#endpoints-de-autenticação)
- [Endpoints Meta](#endpoints-meta)
- [Endpoints de Métricas](#endpoints-de-métricas)
- [Endpoints de Metas](#endpoints-de-metas)
- [Endpoints de Insights FURY](#endpoints-de-insights-fury)
- [Endpoints do Estudio Criativo](#endpoints-do-estudio-criativo)
- [Códigos de Erro](#códigos-de-erro)
- [Exemplos](#exemplos)

---

## Variáveis de Ambiente

Variáveis necessárias para o funcionamento da API:

```env
# Banco de dados
DATABASE_URL=postgresql://fury:fury_local@localhost:5432/fury_dev
TEST_DATABASE_URL=postgresql://fury:fury_local@localhost:5432/fury_test

# Redis
REDIS_URL=redis://localhost:6379

# Configuração JWT
JWT_SECRET=your_secret_key_min_32_chars_required_123456
JWT_REFRESH_SECRET=your_refresh_secret_key_min_32_chars_required_123456

# Configuração do servidor
PORT=3000
NODE_ENV=development

# Opcional
META_USE_MOCK=true  # Usar dados simulados para a API Meta (desenvolvimento/testes)
```

---

## Autenticação

### Bearer Token

Todos os endpoints protegidos exigem um token JWT válido no header `Authorization`:

```bash
Authorization: Bearer <accessToken>
```

### Expiração dos Tokens

- **Token de Acesso:** 15 minutos
- **Refresh Token:** 30 dias

### Renovação do Token

Quando o token de acesso expirar, use o refresh token para obter um novo token sem precisar fazer login novamente.

---

## Endpoints de Autenticação

### POST /auth/register

**Descrição:** Registra um novo usuário e cria seu tenant

**Autenticação:** Não

**Corpo da Requisição:**

```json
{
  "name": "string — Nome completo (1-255 caracteres)",
  "email": "string — Endereço de e-mail válido",
  "password": "string — Mínimo 8 caracteres",
  "companyName": "string — Nome da empresa (1-255 caracteres)"
}
```

**Resposta 201:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "joao@fury.test",
      "role": "owner",
      "tenantId": "uuid",
      "createdAt": "2026-04-30T10:30:00Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Resposta 400:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "O e-mail deve ser um endereço válido"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Resposta 409:**

```json
{
  "success": false,
  "error": {
    "code": "EMAIL_EXISTS",
    "message": "Este e-mail já está cadastrado"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| VALIDATION_ERROR | 400 | Dados de entrada inválidos |
| EMAIL_EXISTS | 409 | E-mail já cadastrado |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

### POST /auth/login

**Descrição:** Autentica o usuário com e-mail e senha

**Autenticação:** Não

**Corpo da Requisição:**

```json
{
  "email": "string — E-mail do usuário",
  "password": "string — Senha do usuário"
}
```

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "joao@fury.test",
      "role": "owner",
      "tenantId": "uuid",
      "createdAt": "2026-04-30T10:30:00Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Resposta 401:**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "E-mail ou senha inválidos"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| VALIDATION_ERROR | 400 | Dados de entrada inválidos |
| INVALID_CREDENTIALS | 401 | E-mail ou senha incorretos |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

### POST /auth/refresh

**Descrição:** Renova o token de acesso usando o refresh token

**Autenticação:** Não

**Corpo da Requisição:**

```json
{
  "refreshToken": "string — Refresh token válido"
}
```

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Resposta 401:**

```json
{
  "success": false,
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Refresh token expirado ou inválido"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| VALIDATION_ERROR | 400 | Formato do refresh token inválido |
| TOKEN_EXPIRED | 401 | Refresh token expirado ou revogado |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

### GET /auth/me

**Descrição:** Retorna informações do usuário autenticado

**Autenticação:** Sim — Bearer Token

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "joao@fury.test",
    "role": "owner",
    "tenantId": "uuid",
    "createdAt": "2026-04-30T10:30:00Z"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| UNAUTHORIZED | 401 | Token ausente, inválido ou expirado |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

### POST /auth/logout

**Descrição:** Faz logout do usuário e revoga o refresh token

**Autenticação:** Sim — Bearer Token

**Resposta 200:**

```json
{
  "success": true,
  "data": null,
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| UNAUTHORIZED | 401 | Token ausente, inválido ou expirado |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

## Endpoints Meta

### POST /meta/connections

**Descrição:** Cria uma nova conexão com o Meta (Facebook Ads) para o tenant

**Autenticação:** Sim — Bearer Token

**Corpo da Requisição:**

```json
{
  "metaUserId": "string — ID do usuário Meta",
  "accessToken": "string — Token de acesso Meta"
}
```

**Resposta 201:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "metaUserId": "mock_user_001",
    "adAccounts": [
      {
        "id": "act_111111111",
        "name": "Loja Fashion SP Ads",
        "account_status": 1,
        "currency": "BRL"
      }
    ],
    "createdAt": "2026-04-30T10:30:00Z"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| VALIDATION_ERROR | 400 | Dados de entrada inválidos |
| UNAUTHORIZED | 401 | Autenticação inválida |
| INTERNAL_SERVER_ERROR | 500 | Falha ao conectar com a API Meta |

---

### GET /meta/connections

**Descrição:** Lista todas as conexões Meta do tenant autenticado

**Autenticação:** Sim — Bearer Token

**Parâmetros de Query:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| page | inteiro | Número da página (padrão: 1) |
| limit | inteiro | Itens por página (padrão: 10, máx: 100) |

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "connections": [
      {
        "id": "uuid",
        "tenantId": "uuid",
        "metaUserId": "mock_user_001",
        "adAccounts": [
          {
            "id": "act_111111111",
            "name": "Loja Fashion SP Ads",
            "account_status": 1,
            "currency": "BRL"
          }
        ],
        "createdAt": "2026-04-30T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1
    }
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| UNAUTHORIZED | 401 | Autenticação inválida |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

### DELETE /meta/connections/:id

**Descrição:** Remove uma conexão Meta

**Autenticação:** Sim — Bearer Token

**Parâmetros de Rota:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| id | uuid | ID da conexão |

**Resposta 204:**

```
(Sem conteúdo)
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| UNAUTHORIZED | 401 | Autenticação inválida |
| FORBIDDEN | 403 | Sem permissão para remover esta conexão |
| NOT_FOUND | 404 | Conexão não encontrada |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

## Endpoints de Métricas

### GET /metrics/summary

**Descrição:** Retorna resumo agregado das métricas de todas as campanhas

**Autenticação:** Sim — Bearer Token

**Parâmetros de Query:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| dateFrom | string | Data inicial (ISO 8601) |
| dateTo | string | Data final (ISO 8601) |

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "summary": {
      "spend": 2100000,
      "impressions": 110000,
      "clicks": 3100,
      "conversions": 107,
      "ctr": 2.82,
      "cpm": 1909,
      "cpa": 431775,
      "roas": 3.8
    }
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| UNAUTHORIZED | 401 | Autenticação inválida |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

### GET /metrics/campaigns

**Descrição:** Retorna lista paginada de campanhas com métricas

**Autenticação:** Sim — Bearer Token

**Parâmetros de Query:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| page | inteiro | Número da página (padrão: 1) |
| limit | inteiro | Itens por página (padrão: 10, máx: 100) |
| status | string | Filtrar por status (draft, active, paused, archived) |
| sortBy | string | Campo de ordenação (name, spend, roas, created_at) |
| sortOrder | string | Direção da ordenação (asc, desc) |

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "campaigns": [
      {
        "id": "uuid",
        "name": "Campanha Verão 2026",
        "status": "active",
        "metrics": {
          "spend": 21000000,
          "impressions": 68000,
          "clicks": 1820,
          "ctr": 2.68,
          "cpm": 3088,
          "cpa": 420000,
          "roas": 4.1,
          "conversions": 50
        },
        "createdAt": "2026-04-25T14:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 6,
      "pages": 1
    }
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| UNAUTHORIZED | 401 | Autenticação inválida |
| VALIDATION_ERROR | 400 | Parâmetros de query inválidos |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

### GET /metrics/goals-progress

**Descrição:** Retorna o progresso em relação às metas mensais

**Autenticação:** Sim — Bearer Token

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "progress": {
      "objective": "aumentar_vendas",
      "budget": 500000,
      "spent": 210000,
      "remaining": 290000,
      "progressPercent": 42,
      "roas": 4.1,
      "targetCpa": 500000,
      "currentCpa": 431775,
      "cpaBelowTarget": true
    }
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| UNAUTHORIZED | 401 | Autenticação inválida |
| NOT_FOUND | 404 | Metas não configuradas |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

### GET /metrics/campaigns/:id

**Descrição:** Retorna métricas detalhadas de uma campanha específica

**Autenticação:** Sim — Bearer Token

**Parâmetros de Rota:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| id | uuid | ID da campanha |

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "campaign": {
      "id": "uuid",
      "name": "Campanha Verão 2026",
      "status": "active",
      "metrics": {
        "spend": 21000000,
        "impressions": 68000,
        "clicks": 1820,
        "ctr": 2.68,
        "cpm": 3088,
        "cpa": 420000,
        "roas": 4.1,
        "conversions": 50,
        "lastUpdated": "2026-04-30T10:00:00Z"
      }
    }
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| UNAUTHORIZED | 401 | Autenticação inválida |
| NOT_FOUND | 404 | Campanha não encontrada |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

## Endpoints de Metas

### POST /goals

**Descrição:** Cria ou atualiza as metas do cliente para o tenant

**Autenticação:** Sim — Bearer Token

**Corpo da Requisição:**

```json
{
  "objective": "string — Objetivo da meta (aumentar_vendas, gerar_leads)",
  "monthlyBudget": {
    "amount": 500000,
    "currency": "BRL"
  },
  "targetCpa": {
    "amount": 500000,
    "currency": "BRL"
  },
  "niche": "string — Nicho do negócio"
}
```

**Resposta 201:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "objective": "aumentar_vendas",
    "monthlyBudget": {
      "amount": 500000,
      "currency": "BRL"
    },
    "targetCpa": {
      "amount": 500000,
      "currency": "BRL"
    },
    "niche": "moda feminina",
    "createdAt": "2026-04-30T10:30:00Z",
    "updatedAt": "2026-04-30T10:30:00Z"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| VALIDATION_ERROR | 400 | Dados de entrada inválidos |
| UNAUTHORIZED | 401 | Autenticação inválida |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

### GET /goals

**Descrição:** Retorna as metas do tenant autenticado

**Autenticação:** Sim — Bearer Token

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "objective": "aumentar_vendas",
    "monthlyBudget": {
      "amount": 500000,
      "currency": "BRL"
    },
    "targetCpa": {
      "amount": 500000,
      "currency": "BRL"
    },
    "niche": "moda feminina",
    "createdAt": "2026-04-30T10:30:00Z",
    "updatedAt": "2026-04-30T10:30:00Z"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| UNAUTHORIZED | 401 | Autenticação inválida |
| NOT_FOUND | 404 | Metas não encontradas |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

## Endpoints de Insights FURY

### GET /fury/insights

**Descrição:** Retorna sugestões geradas pela IA do FURY para as campanhas

**Autenticação:** Sim — Bearer Token

**Parâmetros de Query:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| page | inteiro | Número da página (padrão: 1) |
| limit | inteiro | Itens por página (padrão: 10, máx: 100) |
| priority | string | Filtrar por prioridade (low, medium, high) |
| status | string | Filtrar por status (pending, applied) |

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "insights": [
      {
        "id": "uuid",
        "campaignId": "uuid",
        "campaignName": "Prospecção Fria",
        "suggestionType": "campaign_pause",
        "priority": "high",
        "title": "Pausar campanha com CPA acima da meta",
        "description": "A campanha Prospecção Fria está com CPA de R$88,50, 77% acima da meta de R$50,00. Recomendamos pausar para revisar a segmentação.",
        "expectedImpact": "Redução de 15-20% no CPA médio",
        "appliedAt": null,
        "createdAt": "2026-04-28T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 3
    }
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| UNAUTHORIZED | 401 | Autenticação inválida |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

### POST /fury/insights/:id/apply

**Descrição:** Aplica uma sugestão de insight do FURY

**Autenticação:** Sim — Bearer Token

**Parâmetros de Rota:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| id | uuid | ID do insight |

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "campaignId": "uuid",
    "campaignName": "Prospecção Fria",
    "suggestionType": "campaign_pause",
    "appliedAt": "2026-04-30T10:30:00Z",
    "status": "applied"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| UNAUTHORIZED | 401 | Autenticação inválida |
| NOT_FOUND | 404 | Insight não encontrado |
| CONFLICT | 409 | Insight já aplicado |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

### GET /fury/insights/:id

**Descrição:** Retorna informações detalhadas de um insight específico

**Autenticação:** Sim — Bearer Token

**Parâmetros de Rota:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| id | uuid | ID do insight |

**Resposta 200:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "campaignId": "uuid",
    "campaignName": "Prospecção Fria",
    "suggestionType": "campaign_pause",
    "priority": "high",
    "title": "Pausar campanha com CPA acima da meta",
    "description": "A campanha Prospecção Fria está com CPA de R$88,50, 77% acima da meta de R$50,00. Recomendamos pausar para revisar a segmentação.",
    "expectedImpact": "Redução de 15-20% no CPA médio",
    "suggestionData": {
      "type": "campaign_pause",
      "currentCpa": 8850,
      "targetCpa": 5000,
      "variance": "77%"
    },
    "appliedAt": null,
    "createdAt": "2026-04-28T10:00:00Z"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| UNAUTHORIZED | 401 | Autenticação inválida |
| NOT_FOUND | 404 | Insight não encontrado |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

## Endpoints do Estúdio Criativo

### POST /studio/generate-copy

**Descrição:** Gera variações de copy para anúncios usando IA (Claude). Retorna variações pontuadas com base em limites de caracteres e boas práticas de copywriting.

**Autenticação:** Sim — Bearer Token

**Corpo da Requisição:**

```json
{
  "type": "headline | descricao | cta | completo",
  "produto": "string (mín 3, máx 200 caracteres)",
  "publico": "string (mín 5, máx 200 caracteres)",
  "objetivo": "string (mín 5, máx 200 caracteres)",
  "tom": "formal | casual | urgente | emocional",
  "quantidadeVariacoes": "number (3 a 5, padrão: 3)"
}
```

**Limites de Caracteres por Tipo:**

| Tipo | Limite |
|------|--------|
| `headline` | 40 caracteres |
| `descricao` | 125 caracteres |
| `cta` | 20 caracteres |
| `completo` | 300 caracteres (soft limit) |

**Algoritmo de Pontuação (0–10):**

- 3 pts base
- +3 pts se o texto respeita o limite de caracteres do tipo
- +2 pts se contém palavras de CTA (compre, acesse, saiba, clique, garanta)
- +2 pts se não contém palavras proibidas (grátis excessivo, garantido 100%, melhor do mundo)

**Resposta 200:**

```json
{
  "variacoes": [
    {
      "texto": "string",
      "caracteres": 38,
      "pontuacao": 8
    }
  ]
}
```

**Comportamento de Fallback:**

Quando `ANTHROPIC_API_KEY` não está configurada ou `META_USE_MOCK=true`, o endpoint retorna variações simuladas — sem lançar erro. A quantidade de variações respeita `quantidadeVariacoes`.

**Erros Possíveis:**

| Código | Status | Motivo |
|--------|--------|--------|
| VALIDATION_ERROR | 400 | Campos obrigatórios ausentes ou inválidos |
| UNAUTHORIZED | 401 | Token ausente, inválido ou expirado |
| INTERNAL_SERVER_ERROR | 500 | Erro inesperado no servidor |

**Exemplo cURL:**

```bash
curl -X POST 'http://localhost:3000/api/studio/generate-copy' \
  -H 'Authorization: Bearer SEU_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "headline",
    "produto": "Produto XYZ",
    "publico": "pequenas empresas",
    "objetivo": "aumentar vendas",
    "tom": "casual",
    "quantidadeVariacoes": 3
  }'
```

---

## Códigos de Erro

Códigos de erro padrão retornados pela API:

| Código | Status HTTP | Descrição |
|--------|-------------|-----------|
| VALIDATION_ERROR | 400 | Falha na validação dos dados de entrada |
| UNAUTHORIZED | 401 | Autenticação ausente ou inválida |
| FORBIDDEN | 403 | Permissões insuficientes |
| NOT_FOUND | 404 | Recurso não encontrado |
| CONFLICT | 409 | Conflito de recurso (ex: e-mail duplicado) |
| EMAIL_EXISTS | 409 | E-mail já cadastrado |
| INVALID_CREDENTIALS | 401 | E-mail ou senha incorretos |
| TOKEN_EXPIRED | 401 | Token JWT expirado ou revogado |
| INTERNAL_SERVER_ERROR | 500 | Erro no servidor |

---

## Exemplos

### Fluxo Completo de Login

```bash
# 1. Cadastro
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@fury.test",
    "password": "Senha@123456",
    "companyName": "Loja Fashion SP"
  }'

# Resposta
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "123...",
    "email": "joao@fury.test",
    "role": "owner",
    "tenantId": "456..."
  }
}

# 2. Buscar dados do usuário
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJ..."

# 3. Renovar token
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "eyJ..."}'

# 4. Logout
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer eyJ..."
```

### Buscar Métricas

```bash
# Resumo geral
curl http://localhost:3000/api/metrics/summary \
  -H "Authorization: Bearer eyJ..."

# Campanhas paginadas
curl http://localhost:3000/api/metrics/campaigns?page=1&limit=10 \
  -H "Authorization: Bearer eyJ..."

# Progresso das metas
curl http://localhost:3000/api/metrics/goals-progress \
  -H "Authorization: Bearer eyJ..."
```

---

**Última Atualização:** 2026-04-30

**Equipe:** FURY Development Team