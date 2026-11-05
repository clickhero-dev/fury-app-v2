# API Contracts: Planejador IA

## POST /api/planner/generate

Inicia a geração de um plano mensal para o tenant autenticado.

**Auth**: Bearer token (extraído do header Authorization)

**Request Body**: Nenhum. Toda configuração vem dos dados do tenant.

**Response 201**:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid-do-job",
    "planId": "uuid-do-plano",
    "status": "processing"
  }
}
```

**Response 400** (pré-requisitos não atendidos):
```json
{
  "success": false,
  "error": {
    "code": "PREREQUISITES_NOT_MET",
    "message": "Configure o Instagram e Facebook antes de gerar o planejamento."
  }
}
```

**Response 409** (já existe plano para o mês):
```json
{
  "success": false,
  "error": {
    "code": "PLAN_ALREADY_EXISTS",
    "message": "Já existe um plano para Julho de 2026. Gere um novo para sobrescrever."
  }
}
```

## GET /api/planner/jobs/:jobId

Polling de progresso do job de geração.

**Auth**: Bearer token

**Response 200**:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "processing",
    "progress": 45,
    "currentStep": "Pesquisando concorrentes",
    "planId": null
  }
}
```

**Response 200** (completo):
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "completed",
    "progress": 100,
    "currentStep": "Finalizando",
    "planId": "uuid-do-plano"
  }
}
```

## GET /api/planner/plans/:planId

Retorna o plano completo com todos os posts.

**Auth**: Bearer token

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "month": 7,
    "year": 2026,
    "objective": "Aumentar engajamento no Instagram",
    "status": "completed",
    "postCount": 16,
    "reelsCount": 8,
    "carouselCount": 4,
    "imageCount": 4,
    "storiesCount": 31,
    "posts": [
      {
        "id": "uuid",
        "type": "reel",
        "title": "Antes e depois: resultados reais",
        "caption": "Veja como transformamos...",
        "cta": "Saiba mais",
        "hashtags": ["#resultados", "#antesedepois"],
        "imagePrompt": "Antes e depois de um rosto",
        "objective": "Mostrar autoridade",
        "scheduledDate": "2026-07-03",
        "scheduledTime": "10:00",
        "status": "draft",
        "sortOrder": 1
      }
    ]
  }
}
```

## PATCH /api/planner/posts/:postId

Atualiza um post individual.

**Auth**: Bearer token

**Request Body** (parcial):
```json
{
  "caption": "Nova legenda editada",
  "status": "approved"
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "approved"
  }
}
```

## POST /api/planner/plans/:planId/approve

Aprova e agenda todos os posts do plano.

**Auth**: Bearer token

**Response 200**:
```json
{
  "success": true,
  "data": {
    "planId": "uuid",
    "approved": 16,
    "scheduled": 16
  }
}
```

## POST /api/planner/posts/:postId/improve

Melhora um post via chat IA.

**Auth**: Bearer token

**Request Body**:
```json
{
  "instruction": "Torne mais engraçado"
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "caption": "Nova legenda com tom engraçado...",
    "cta": "Novo CTA"
  }
}
```
