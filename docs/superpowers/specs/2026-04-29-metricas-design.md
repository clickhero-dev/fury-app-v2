# Design: Endpoints de Métricas da Meta Ads API

**Data:** 2026-04-29  
**Autor:** Brainstorming Session  
**Status:** Design Review

---

## 1. Visão Geral

Implementar 5 endpoints de métricas para o dashboard do FURY com dados agregados de campanhas da Meta Ads. Durante desenvolvimento (enquanto OAuth não está pronto), usar mock de dados via Strategy Pattern.

**Decisão de Arquitetura:** Strategy Pattern com `IMetricsProvider` + `MockMetricsProvider` + `DatabaseMetricsProvider`

---

## 2. Requisitos

### 2.1 Dados de Entrada

- **Armazenamento:** Campo `metrics` (JSONB) na tabela `campaigns` com histórico diário
- **Formato Interno:** Valores monetários em **centavos** no BD
- **Formato API:** Valores monetários em **reais** nas respostas
- **Granularidade:** Dados diários agregáveis em períodos customizados
- **Default Temporal:** Se `startDate`/`endDate` não forem especificados, usar últimos 30 dias
- **Paginação Default:** 10 registros por página

### 2.2 Campos Rastreados

- `spend` (monetário)
- `impressions` (número)
- `clicks` (número)
- `conversions` (número)
- `roas` (taxa de retorno, já calculada)

### 2.3 Métricas Calculadas

| Métrica | Fórmula | Casas Decimais |
|---------|---------|----------------|
| CTR | (clicks / impressions) × 100 | 2 |
| CPM | (spend / impressions) × 1000 | 2 |
| CPA | spend / conversions | 2 |
| ROAS | armazenado ou (revenue / spend) | 2 |

---

## 3. Arquitetura

### 3.1 Padrão: Strategy Pattern

```
Request → AuthMiddleware → TenantMiddleware
  ↓
Controller (valida params)
  ↓
MetricsService (orquestra)
  ↓
IMetricsProvider (interface)
  ├─ MockMetricsProvider
  └─ DatabaseMetricsProvider
```

**Injeção:** Variable `META_USE_MOCK` (true/false) define qual provider é instanciado.

### 3.2 Fluxo de Requisição

1. **AuthMiddleware:** Valida JWT, injeta `userId` em `req.user`
2. **TenantMiddleware:** Busca tenant do usuário, injeta `tenantId` em `req.tenant`
3. **Controller:** 
   - Valida query params com Zod
   - Calcula `startDate`/`endDate` (default: últimos 30 dias)
   - Chama `MetricsService.getXxx(tenantId, ...)`
4. **Service:**
   - Chama `provider.getMetrics(tenantId, startDate, endDate)`
   - Agrega dados: soma, média, cálculos
   - Converte centavos → reais
   - Arredonda para 2 casas
5. **Provider:**
   - **Mock:** Retorna dados estáticos de `src/lib/meta-mock.ts`
   - **DB:** Busca na tabela `campaigns`, filtra por `tenantId` e datas, agrega

### 3.3 Estrutura de Arquivos

```
src/
├── lib/
│   ├── meta-mock.ts                      # Dados fictícios
│   └── providers/
│       ├── metrics.provider.ts           # Interface IMetricsProvider
│       ├── mock-metrics.provider.ts      # Implementação Mock
│       └── db-metrics.provider.ts        # Implementação Drizzle
├── middleware/
│   ├── auth.middleware.ts                # NEW: JWT validation
│   ├── tenant.middleware.ts              # NEW: Tenant injection
│   └── errorHandler.ts, logger.ts        # Existentes
├── services/
│   └── metrics.service.ts                # Orquestra lógica
├── controllers/
│   └── metrics.controller.ts             # HTTP handlers
├── routes/
│   ├── metrics.routes.ts                 # Endpoints
│   └── index.ts                          # Router principal
├── types/
│   └── metrics.types.ts                  # Zod schemas + interfaces
└── ...
```

---

## 4. Tipos e Validações (Zod)

### 4.1 Dados Internos (BD em centavos)

```typescript
interface DailyMetricsDB {
  date: string;          // YYYY-MM-DD
  spend: number;         // centavos
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;          // já calculado ou 0
}

interface CampaignMetricsDB {
  campaignId: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  daily: DailyMetricsDB[];
}
```

### 4.2 Respostas API (Reais)

```typescript
interface MetricsSummaryResponse {
  spend: number;         // reais
  impressions: number;
  clicks: number;
  ctr: number;           // % com 2 casas
  cpm: number;           // com 2 casas
  cpa: number;           // com 2 casas
  roas: number;          // com 2 casas
  conversions: number;
}

interface CampaignResponse {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  spend: number;
  roas: number;
  cpa: number;
  impressions: number;
  clicks: number;
}

interface DailyMetricsResponse {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
}

interface GoalProgressResponse {
  goal: {
    id: string;
    metric: 'roas' | 'clicks' | 'spend' | 'conversions';
    target: number;
  };
  current: number;
  progressPercent: number;
  onTrack: boolean;
}
```

### 4.3 Validações Zod

```typescript
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required');

const metricsQuerySchema = z.object({
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  adAccountId: z.string().optional(),
}).refine(
  (data) => !data.startDate || !data.endDate || new Date(data.endDate) >= new Date(data.startDate),
  { message: 'endDate must be >= startDate', path: ['endDate'] }
);

const campaignsQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
});

const dailyQuerySchema = z.object({
  startDate: dateSchema,  // obrigatório
  endDate: dateSchema,    // obrigatório
  adAccountId: z.string().optional(),
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  { message: 'endDate must be >= startDate', path: ['endDate'] }
);
```

---

## 5. Endpoints

### 5.1 GET /api/metrics/summary

**Params:** `startDate?`, `endDate?`, `adAccountId?`

**Middleware:** AuthMiddleware, TenantMiddleware

**Lógica:**
- Se não houver `startDate`/`endDate`, usar últimos 30 dias
- Agregar todas as campanhas do tenant
- Calcular CTR, CPM, CPA, ROAS médios
- Converter centavos → reais
- Arredondar para 2 casas

**Resposta (200):**
```json
{
  "spend": 48.50,
  "impressions": 145200,
  "clicks": 3840,
  "ctr": 2.64,
  "cpm": 33.40,
  "cpa": 48.50,
  "roas": 3.20,
  "conversions": 100
}
```

**Sem dados:** `null` ou estrutura com zeros

---

### 5.2 GET /api/metrics/campaigns

**Params:** `status?`, `page?` (default 1), `limit?` (default 10), `startDate?`, `endDate?`

**Lógica:**
- Buscar campanhas do tenant com filtro de `status` se passado
- Agregar métricas (últimos 30 dias se não especificado período)
- Ordenar por `spend` DESC
- Paginar
- Converter centavos → reais

**Resposta (200):**
```json
{
  "data": [
    {
      "id": "camp_001",
      "name": "Black Friday",
      "status": "ACTIVE",
      "spend": 21.00,
      "roas": 4.10,
      "cpa": 42.00,
      "impressions": 68000,
      "clicks": 1820
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 3
  }
}
```

**Sem dados:** `{ data: [], pagination: {...} }`

---

### 5.3 GET /api/metrics/campaigns/:campaignId/insights

**Params:** nenhum (usa `:campaignId` da URL)

**Lógica:**
- Buscar campanha específica
- Retornar summary + breakdown diário dos últimos 30 dias
- Se campanha não existir, retornar 200 com estrutura vazia

**Resposta (200):**
```json
{
  "campaign": {
    "id": "camp_001",
    "name": "Black Friday",
    "status": "ACTIVE"
  },
  "summary": {
    "spend": 21.00,
    "impressions": 68000,
    "clicks": 1820,
    "ctr": 2.68,
    "cpm": 30.88,
    "cpa": 42.00,
    "roas": 4.10,
    "conversions": 50
  },
  "daily": [
    {
      "date": "2026-04-29",
      "spend": 0.70,
      "impressions": 2200,
      "clicks": 59,
      "conversions": 1,
      "roas": 4.10
    }
  ]
}
```

---

### 5.4 GET /api/metrics/daily

**Params:** `startDate` (obrigatório), `endDate` (obrigatório), `adAccountId?`

**Lógica:**
- Validar datas (formato, endDate >= startDate)
- Agregar todos os dados diários do tenant no período
- Converter centavos → reais
- Retornar array ordenado por data ASC

**Resposta (200):**
```json
[
  {
    "date": "2026-03-30",
    "spend": 162.00,
    "impressions": 4840,
    "clicks": 128,
    "conversions": 3,
    "roas": 3.20
  }
]
```

**Sem dados:** `[]`

---

### 5.5 GET /api/metrics/goals-progress

**Params:** nenhum

**Lógica:**
- Buscar metas do cliente na tabela `client_goals`
- Buscar métricas reais dos últimos 30 dias
- Comparar: `current / target × 100`
- `onTrack`: true se `progressPercent >= 100`

**Resposta (200):**
```json
[
  {
    "goal": {
      "id": "goal_001",
      "metric": "roas",
      "target": 3.50
    },
    "current": 3.20,
    "progressPercent": 91.43,
    "onTrack": false
  },
  {
    "goal": {
      "id": "goal_002",
      "metric": "spend",
      "target": 5000
    },
    "current": 4850,
    "progressPercent": 97.00,
    "onTrack": true
  }
]
```

**Sem metas:** `[]`

---

## 6. Tratamento de Erros

| Status | Cenário | Response |
|--------|---------|----------|
| 400 | Datas inválidas, `endDate < startDate`, params fora do range | `{ success: false, error: { code, message } }` |
| 401 | JWT inválido/ausente | AuthMiddleware retorna 401 |
| 403 | Tenant mismatch (usuário tenta acessar dados de outro tenant) | TenantMiddleware retorna 403 |
| 200 | Sem dados para o período/tenant | Estrutura vazia (`[]`, `null`, `{ data: [] }`) |

---

## 7. Variáveis de Ambiente

```env
# .env.example
META_USE_MOCK=true          # "true" para usar mock, "false" para BD
PORT=3000
NODE_ENV=development
```

Quando `META_USE_MOCK=true`, todos os endpoints retornam dados de `src/lib/meta-mock.ts`.

---

## 8. Testes

- **Unit:** Testes de cálculos (CTR, CPM, CPA, ROAS), conversão centavos→reais, arredondamento
- **Integration:** Testes de endpoints com mock (200 OK, validações, paginação)
- **Mock vs DB:** Duas suites de testes, uma com `META_USE_MOCK=true`, outra com `false`

---

## 9. Próximos Passos (Não Neste Sprint)

1. Integração OAuth com Meta (substituir `MockMetricsProvider` por chamadas reais)
2. Sincronização automática de dados via cron/webhook
3. Alertas quando metas são atingidas/perdidas
4. Export de dados (CSV, PDF)

---

## Apêndice A: Mock Data Structure

```typescript
// src/lib/meta-mock.ts
export const mockMetrics = {
  summary: { ... },
  campaigns: [ ... ],
  daily: [ ... ]  // 30 dias de dados
};
```

Mock retorna dados estáticos realistas para 3 campanhas em status ACTIVE/PAUSED.
