# Tasks: Calendário Editorial — Publicação Instagram (GAP-1) + UX date/time (GAP-2)

**Feature**: `specs/010-calendario-interativo/`
**Status**: ✅ COMPLETO — todas as 10 tasks implementadas.

## User Story 1 — Publicação automática no Instagram (P1)

Como usuário do FURY, quero que os posts que agendei no calendário sejam publicados automaticamente no feed do Instagram no horário programado, para não precisar fazer isso manualmente.

**Independent test**: Criar um post com `scheduledAt` no passado, imagem válida, e verificar que o cron publica no Instagram e atualiza o status para `published`.

---

## Phase 1: DB Migration

- [x] T001 Adicionar colunas `publish_attempts`, `last_publish_error`, `next_retry_at` e enum `failed` na tabela `social_posts` em `packages/db/src/schema.ts` e rodar `pnpm drizzle-kit push`

## Phase 2: Meta API — Funções de publicação

- [x] T002 [P] [US1] Criar `createInstagramMedia(igUserId, accessToken, params)` em `apps/api/src/lib/meta-api.ts` — POST `/{igUserId}/media` para criar media container (image_url ou video_url)
- [x] T003 [P] [US1] Criar `getMediaContainerStatus(containerId, accessToken)` em `apps/api/src/lib/meta-api.ts` — GET `/{containerId}?fields=status_code` para polling de vídeo
- [x] T004 [P] [US1] Criar `publishInstagramMedia(igUserId, accessToken, creationId)` em `apps/api/src/lib/meta-api.ts` — POST `/{igUserId}/media_publish`

## Phase 3: Service — Refatorar publishDuePosts

- [x] T005 [US1] Extrair `resolveInstagramAccount(tenantId)` em `apps/api/src/services/planner.service.ts` — busca `metaConnections` do tenant, resolve primeira página com IG do `selectedPageIds`, retorna `{ igUserId, accessToken }` ou `null`
- [x] T006 [US1] Criar `publishSinglePost(post, igUserId, accessToken)` (função pura, testável) em `apps/api/src/services/planner.service.ts` — chama T002/T004, faz polling (T003) se vídeo, retorna `{ mediaId }` ou lança erro
- [x] T007 [US1] Refatorar `publishDuePosts(tenantId)` em `apps/api/src/services/planner.service.ts` — usa T005+T006 com retry backoff (1/5/15min, máx 3 tentativas → `failed`), atualiza `publishAttempts`, `lastPublishError`, `nextRetryAt`

## Phase 4: Testes unitários

- [x] T008 [P] [US1] Criar `apps/api/src/__tests__/publish-due.test.ts` — testar `publishSinglePost` com mock de `metaApiCall`: imagem (sucesso), vídeo (sucesso com polling), erro de rede (throw), container ERROR (throw)
- [x] T009 [US1] Adicionar testes de retry no mesmo arquivo — backoff [1,5,15], tenant sem IG (documentado)

## Phase 5: GAP-2 — Frontend datetime-local

- [x] T010 Substituir `type="datetime-local"` por `type="date"` + `type="time"` no CreatePostDialog em `apps/web/src/pages/planejador/components/CalendarView.tsx` — estado: `scheduledDate` + `scheduledTime`, combinar em ISO string ao enviar

---

## Verification

```bash
pnpm drizzle-kit push          # T001 ✅
pnpm tsc --noEmit              # type-check ✅
pnpm vitest run                # T008-T009 ✅ 9/9 passando
```
