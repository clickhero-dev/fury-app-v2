# Quickstart: Validação FR8 (Publicação Instagram)

## Pré-requisitos

- PostgreSQL rodando (local `fury-postgres:5444` ou `localhost:5432`)
- Meta App configurado com `META_APP_ID` e `META_APP_SECRET` no `.env`
- Tenant com conexão Meta ativa (página com Instagram Business vinculado)
- Post criado no calendário com `status = 'approved'`, `imageUrl` preenchida, `scheduledAt` no passado

## Setup

```bash
cd /home/diogo/click-hero/fury-app-v2

# 1. Aplica migration (novas colunas)
cd apps/api
pnpm drizzle-kit push

# 2. Roda API
pnpm dev
```

## Validação manual

### 1. Verificar migration

```bash
psql -h localhost -p 5444 -U fury -d fury_local \
  -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'social_posts' AND column_name IN ('publish_attempts', 'last_publish_error', 'next_retry_at');"
```

Deve retornar 3 colunas.

### 2. Disparar publicação manual

```bash
# Cria um post de teste com scheduledAt no passado (via API)
curl -s -X POST http://localhost:3001/planner/posts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"caption":"Teste publi","postType":"image","dayIndex":11,"imageUrl":"https://picsum.photos/800/800.jpg","scheduledAt":"2026-08-10T00:00:00.000Z"}' | jq .

# Executa publish-due (cron)
curl -s -X POST http://localhost:3001/planner/cron/publish-due | jq .
```

Se o tenant tiver Instagram vinculado, o resultado deve incluir `"published": 1`.

### 3. Verificar status do post

```bash
curl -s "http://localhost:3001/planner/calendar?year=2026&month=8" \
  -H "Authorization: Bearer <token>" | jq '.data.posts[] | select(.status == "published")'
```

### 4. Simular falha e verificar retry

```bash
# Após uma falha (ex: token inválido), verificar campos de retry
psql -h localhost -p 5444 -U fury -d fury_local \
  -c "SELECT id, status, publish_attempts, last_publish_error, next_retry_at FROM social_posts WHERE publish_attempts > 0;"
```

## Testes unitários

```bash
cd apps/api
pnpm vitest run src/__tests__/publish-due.test.ts
```

Deve cobrir:
- `publishSinglePost` com mock de `metaApiCall` (imagem)
- `publishSinglePost` com mock de `metaApiCall` (vídeo + polling)
- `publishSinglePost` com falha de rede → erro capturado
- Retry logic: `publishAttempts` incrementa, `nextRetryAt` calcula backoff
- Após 3 falhas → `status = 'failed'`

## Validação GAP-2 (datetime-local → date+time)

```bash
# Abre o calendário no browser
# Clica "+ Novo post"
# Verifica que o campo de agendamento tem DOIS inputs: "Data" (type=date) + "Hora" (type=time)
# NÃO deve existir type="datetime-local" no DOM
```
