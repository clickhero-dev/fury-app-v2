# 🚀 Metrics API - Quickstart Guide

## 📋 Pré-requisitos

- Node.js 20+
- `npm`
- Porta 3333 disponível

## 🔧 Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Gerar token de teste

```bash
# Copie e execute este comando para gerar um token base64
echo '{"userId":"tenant_123"}' | base64
```

Saída esperada:
```
eyJ1c2VySWQiOiJ0ZW5hbnRfMTIzIn0K
```

Salve este token - você vai usar em todas as requisições.

### 3. Configurar variáveis de ambiente

Já existe um arquivo `.env` configurado em `/apps/api` com:

```bash
PORT=3333
NODE_ENV=development
META_USE_MOCK=true
```

Este arquivo é carregado automaticamente ao iniciar o servidor.

### 4. Iniciar o servidor

```bash
npm run dev
```

Você verá:
```
✅ Server running on http://localhost:3333
📝 Environment: development
```

---

## 📡 Endpoints de Teste

### Setup: Variável de Token

```bash
TOKEN="eyJ1c2VySWQiOiJ0ZW5hbnRfMTIzIn0K"
API="http://localhost:3333/api"
```

Use esses valores em todos os exemplos abaixo.

---

## 1️⃣ GET /api/metrics/summary

**Descrição:** Retorna métricas agregadas (últimos 30 dias)

```bash
curl -X GET "$API/metrics/summary" \
  -H "Authorization: Bearer $TOKEN"
```

**Com período customizado:**

```bash
curl -X GET "$API/metrics/summary?startDate=2026-04-20&endDate=2026-04-29" \
  -H "Authorization: Bearer $TOKEN"
```

**Resposta esperada:**

```json
{
  "success": true,
  "data": {
    "spend": 162,
    "impressions": 48400,
    "clicks": 1280,
    "ctr": 2.64,
    "cpm": 3.35,
    "cpa": 4.91,
    "roas": 3.2,
    "conversions": 33
  }
}
```

---

## 2️⃣ GET /api/metrics/campaigns

**Descrição:** Lista paginada de campanhas (padrão: 10 por página)

```bash
# Página 1, 10 registros
curl -X GET "$API/metrics/campaigns?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Filtrar por status:**

```bash
curl -X GET "$API/metrics/campaigns?status=ACTIVE&page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Com período customizado:**

```bash
curl -X GET "$API/metrics/campaigns?startDate=2026-04-20&endDate=2026-04-29&page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Resposta esperada:**

```json
{
  "success": true,
  "data": [
    {
      "id": "camp_001",
      "name": "Campanha Black Friday",
      "status": "ACTIVE",
      "spend": 69.7,
      "roas": 3.2,
      "cpa": 3.49,
      "impressions": 22650,
      "clicks": 610
    },
    {
      "id": "camp_003",
      "name": "Prospecção Fria",
      "status": "PAUSED",
      "spend": 59.9,
      "roas": 3.2,
      "cpa": 5.99,
      "impressions": 18390,
      "clicks": 430
    },
    {
      "id": "camp_002",
      "name": "Retargeting Carrinho",
      "status": "ACTIVE",
      "spend": 32.4,
      "roas": 3.2,
      "cpa": 3.24,
      "impressions": 7360,
      "clicks": 250
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 3
  }
}
```

---

## 3️⃣ GET /api/metrics/campaigns/:campaignId/insights

**Descrição:** Detalhes de uma campanha + breakdown diário (últimos 30 dias)

```bash
# Insight da campanha Black Friday
curl -X GET "$API/metrics/campaigns/camp_001/insights" \
  -H "Authorization: Bearer $TOKEN"
```

**Com período customizado:**

```bash
curl -X GET "$API/metrics/campaigns/camp_001/insights?startDate=2026-04-20&endDate=2026-04-29" \
  -H "Authorization: Bearer $TOKEN"
```

**Resposta esperada:**

```json
{
  "success": true,
  "data": {
    "campaign": {
      "id": "camp_001",
      "name": "Campanha Black Friday",
      "status": "ACTIVE"
    },
    "summary": {
      "spend": 69.7,
      "impressions": 22650,
      "clicks": 610,
      "ctr": 2.69,
      "cpm": 3.08,
      "cpa": 3.49,
      "roas": 3.2,
      "conversions": 20
    },
    "daily": [
      {
        "date": "2026-04-20",
        "spend": 6.97,
        "impressions": 2265,
        "clicks": 61,
        "conversions": 2,
        "roas": 3.2
      },
      {
        "date": "2026-04-21",
        "spend": 6.97,
        "impressions": 2265,
        "clicks": 61,
        "conversions": 2,
        "roas": 3.2
      }
    ]
  }
}
```

---

## 4️⃣ GET /api/metrics/daily

**Descrição:** Série temporal de métricas diárias (OBRIGATÓRIO: startDate + endDate)

```bash
# Últimos 5 dias
curl -X GET "$API/metrics/daily?startDate=2026-04-25&endDate=2026-04-29" \
  -H "Authorization: Bearer $TOKEN"
```

**Período mais longo:**

```bash
curl -X GET "$API/metrics/daily?startDate=2026-04-01&endDate=2026-04-29" \
  -H "Authorization: Bearer $TOKEN"
```

**Resposta esperada:**

```json
{
  "success": true,
  "data": [
    {
      "date": "2026-04-25",
      "spend": 16.2,
      "impressions": 4840,
      "clicks": 128,
      "conversions": 3,
      "roas": 3.2
    },
    {
      "date": "2026-04-26",
      "spend": 16.2,
      "impressions": 4840,
      "clicks": 128,
      "conversions": 3,
      "roas": 3.2
    },
    {
      "date": "2026-04-27",
      "spend": 16.2,
      "impressions": 4840,
      "clicks": 128,
      "conversions": 4,
      "roas": 3.2
    },
    {
      "date": "2026-04-28",
      "spend": 16.2,
      "impressions": 4840,
      "clicks": 128,
      "conversions": 3,
      "roas": 3.2
    },
    {
      "date": "2026-04-29",
      "spend": 16.2,
      "impressions": 4840,
      "clicks": 128,
      "conversions": 3,
      "roas": 3.2
    }
  ]
}
```

---

## 5️⃣ GET /api/metrics/goals-progress

**Descrição:** Compara métricas reais com metas (últimos 30 dias)

```bash
curl -X GET "$API/metrics/goals-progress" \
  -H "Authorization: Bearer $TOKEN"
```

**Resposta esperada (quando metas forem configuradas):**

```json
{
  "success": true,
  "data": []
}
```

---

## 🧪 Script de Teste Completo

Salve como `test-metrics.sh`:

```bash
#!/bin/bash

TOKEN="eyJ1c2VySWQiOiJ0ZW5hbnRfMTIzIn0K"
API="http://localhost:3333/api"

echo "🧪 Testing Metrics API"
echo "======================"
echo ""

echo "1️⃣ Summary"
curl -s -X GET "$API/metrics/summary" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

echo "2️⃣ Campaigns"
curl -s -X GET "$API/metrics/campaigns?page=1&limit=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

echo "3️⃣ Campaign Insights"
curl -s -X GET "$API/metrics/campaigns/camp_001/insights" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

echo "4️⃣ Daily Metrics"
curl -s -X GET "$API/metrics/daily?startDate=2026-04-25&endDate=2026-04-29" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

echo "5️⃣ Goals Progress"
curl -s -X GET "$API/metrics/goals-progress" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

echo "✅ Tests Complete!"
```

Executar:

```bash
chmod +x test-metrics.sh
./test-metrics.sh
```

---

## ⚠️ Validações & Erros

### Erro 400: Datas inválidas

```bash
# ❌ ERRADO: endDate < startDate
curl -X GET "$API/metrics/daily?startDate=2026-04-29&endDate=2026-04-25" \
  -H "Authorization: Bearer $TOKEN"

# Resposta:
# {"success": false, "error": {"code": "VALIDATION_ERROR", "message": "endDate must be >= startDate"}}
```

### Erro 400: Parâmetros obrigatórios

```bash
# ❌ ERRADO: daily sem startDate
curl -X GET "$API/metrics/daily?endDate=2026-04-29" \
  -H "Authorization: Bearer $TOKEN"

# Resposta:
# {"success": false, "error": {"code": "VALIDATION_ERROR", "message": "startDate is required"}}
```

### Erro 401: Token inválido

```bash
# ❌ ERRADO: sem Authorization header
curl -X GET "$API/metrics/summary"

# Resposta:
# {"success": false, "error": {"code": "UNAUTHORIZED", "message": "Missing or invalid Authorization header"}}
```

---

## 📊 Mock Data Info

O servidor usa dados fictícios determinísticos (não aleatórios):

- **3 campanhas:**
  - `camp_001` - Campanha Black Friday (ACTIVE)
  - `camp_002` - Retargeting Carrinho (ACTIVE)
  - `camp_003` - Prospecção Fria (PAUSED)

- **30 dias de histórico** (últimos 30 dias) com valores fixos por dia
- **Métricas agregadas (30 dias):**
  - Total spend: R$ 486.00
  - Total impressions: 145.200
  - Total clicks: 3.840
  - CTR: 2.64%
  - CPM: R$ 3.35
  - CPA: R$ 4.86
  - ROAS médio: 3.20
  - Total conversões: 100

**Valores diários:**
- Spend: R$ 16.20 (1.620 centavos)
- Impressions: 4.840
- Clicks: 128
- Conversões: 3-4 (padrão alternado)
- ROAS: 3.20

---

## 💡 Tips

- Use `| python3 -m json.tool` para formatar JSON
- Use `| head -20` para limitar linhas da resposta
- Salve o token em variável de ambiente para reutilizar
- Teste sem período primeiro para usar default (30 dias)

---

## 🔧 Troubleshooting

### Porta 3333 em uso

Se a porta 3333 já está em uso, altere no arquivo `.env`:

```bash
PORT=3334  # ou qualquer outra porta disponível
```

### Variáveis de ambiente não carregadas

O arquivo `.env` é carregado automaticamente. Certifique-se de que:
- O arquivo `.env` existe em `/apps/api`
- As variáveis estão no formato: `KEY=value`
- Reinicie o servidor após alterações no `.env`

### Dados mock não aparecem

Verifique se `META_USE_MOCK=true` está configurado no `.env`:

```bash
cat .env | grep META_USE_MOCK
# Deve retornar: META_USE_MOCK=true
```

---

**Status:** ✅ Pronto para teste local  
**Branch:** `feature/api-metricas-gabriel`  
**Port:** 3333
