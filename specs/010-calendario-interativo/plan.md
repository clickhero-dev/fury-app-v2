# Plano — Calendário Editorial (GAP-1: Publicação Instagram + GAP-2: date+time)

**Status**: FR0–FR7 implementados. Restam GAP-1 (FR8) e GAP-2 (FR6 UX).

## Arquivos afetados

| Arquivo | Tipo | Ação |
|---------|------|------|
| `apps/api/src/lib/meta-api.ts` | Lib | Adicionar `createInstagramMedia`, `publishInstagramMedia`, `checkMediaContainerStatus` |
| `apps/api/src/services/planner.service.ts` | Service | Refatorar `publishDuePosts`, extrair `publishSinglePost` (testável) |
| `apps/api/src/controllers/planner.controller.ts` | Controller | Sem alteração (já tem `handlePublishDue`) |
| `apps/api/drizzle/schema.ts` | Schema | Adicionar colunas `publishAttempts`, `lastPublishError`, `nextRetryAt` |
| `apps/api/src/__tests__/publish-due.test.ts` | Teste | Novo: testes unitários do `publishSinglePost` |
| `apps/web/src/pages/planejador/components/CalendarView.tsx` | Frontend | GAP-2: `datetime-local` → `date` + `time` no CreatePostDialog |

## Fase 1: DB Migration

**Tarefa 1.1** — Adicionar colunas ao schema Drizzle

Arquivo: `apps/api/drizzle/schema.ts` — tabela `socialPosts`

```typescript
publishAttempts: integer('publish_attempts').default(0).notNull(),
lastPublishError: text('last_publish_error'),
nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
```

Aplicar: `pnpm drizzle-kit push`

## Fase 2: Meta API — Funções de publicação

**Tarefa 2.1** — `createInstagramMedia` em `meta-api.ts`

```typescript
export async function createInstagramMedia(
  igUserId: string,
  accessToken: string,
  params: { imageUrl?: string; videoUrl?: string; caption?: string; mediaType?: 'REELS' }
): Promise<{ id: string }> {
  // POST /{igUserId}/media
}
```

**Tarefa 2.2** — `getMediaContainerStatus` em `meta-api.ts`

```typescript
export async function getMediaContainerStatus(
  containerId: string,
  accessToken: string
): Promise<string> {
  // GET /{containerId}?fields=status_code → retorna 'FINISHED', 'IN_PROGRESS', 'ERROR'
}
```

**Tarefa 2.3** — `publishInstagramMedia` em `meta-api.ts`

```typescript
export async function publishInstagramMedia(
  igUserId: string,
  accessToken: string,
  creationId: string
): Promise<{ id: string }> {
  // POST /{igUserId}/media_publish?creation_id={creationId}
}
```

## Fase 3: Service — Refatorar publishDuePosts

**Tarefa 3.1** — Extrair `resolveInstagramAccount(tenantId)` 

Retorna `{ igUserId, accessToken }` ou `null` se tenant não tem IG.

**Tarefa 3.2** — Criar `publishSinglePost(post, igUserId, accessToken)` (função pura, testável)

```typescript
// ponytail: função pura — recebe tudo por parâmetro, não acessa db
export async function publishSinglePost(
  post: { id: string; postType: string; caption?: string; imageUrl?: string },
  igUserId: string,
  accessToken: string
): Promise<{ success: true; mediaId: string }> {
  // 1. createInstagramMedia (image_url ou video_url + media_type)
  // 2. Se vídeo: poll getMediaContainerStatus (3x, backoff 3s/6s/12s)
  // 3. publishInstagramMedia
  // Se erro em qualquer passo → throw com mensagem descritiva
}
```

**Tarefa 3.3** — Refatorar `publishDuePosts(tenantId)` para usar as novas funções

```typescript
export async function publishDuePosts(tenantId: string) {
  // 1. resolveInstagramAccount(tenantId) → se null, retorna { published: 0 }
  // 2. Query: posts com scheduledAt <= now(), status = 'approved', (nextRetryAt IS NULL OR nextRetryAt <= now())
  // 3. Para cada post:
  //    try { publishSinglePost(post, igUserId, accessToken) }
  //    catch (err) { atualiza publishAttempts, lastPublishError, nextRetryAt (backoff) }
  // 4. Se publishAttempts >= 3 → status = 'failed'
  // 5. Retorna { published: N }
}
```

**Retry backoff**: `[1, 5, 15]` minutos. `nextRetryAt = now() + backoff[publishAttempts]`.

## Fase 4: Testes unitários

**Tarefa 4.1** — `apps/api/src/__tests__/publish-due.test.ts`

Cobrir com vitest:
- `publishSinglePost` com imagem → sucesso
- `publishSinglePost` com vídeo → polling → sucesso
- `publishSinglePost` com erro de rede → throw
- `publishSinglePost` com container `ERROR` → throw
- Retry backoff calculation (1, 5, 15)
- Após 3 falhas → não reprocessa
- `resolveInstagramAccount` → null quando tenant sem IG

## Fase 5: GAP-2 — Frontend datetime-local

**Tarefa 5.1** — Substituir `datetime-local` no CreatePostDialog

Arquivo: `CalendarView.tsx:607`

```tsx
// Antes: <input type="datetime-local" value={scheduledAt} ...>

// Depois:
<div className="grid grid-cols-2 gap-3">
  <div>
    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Data</label>
    <input type="date" value={scheduledDate}
      onChange={e => { setScheduledDate(e.target.value); /* combina com scheduledTime */ }}
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm" />
  </div>
  <div>
    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Hora</label>
    <input type="time" value={scheduledTime}
      onChange={e => { setScheduledTime(e.target.value); }}
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm" />
  </div>
</div>
```

Estado: `scheduledDate` + `scheduledTime` → combinar em ISO string antes de enviar pra API.

## Ordem de execução

1. Fase 1 (migration) → `pnpm drizzle-kit push`
2. Fase 2 (meta-api.ts) → 3 funções novas
3. Fase 3 (service) → refactor + publishSinglePost
4. Fase 4 (testes) → `publish-due.test.ts`
5. Fase 5 (frontend) → GAP-2
6. `pnpm tsc` + `pnpm vitest run` → verificar
