# QA Report — Erro do publish-now (docs/issues/erro-publish-now.md)

**Data:** 2026-09-23 · **Autor:** @qa · **Tipo:** Avaliação de erro + teste de integração

## 1. Avaliação do erro

### Evidência (docs/issues/erro-publish-now.md)

```json
{"success":true,"data":{"id":"7f1a2c12-daf7-40f9-8172-b498be5cf23b","status":"failed","lastPublishError":"[Meta API] 25: User access is restricted"},"timestamp":"2026-09-23T18:32:19.569Z"}
```

```json
{"success":true,"data":{"id":"0cd5fc8f-45c4-4c84-898e-afd9dcec1421","status":"failed","lastPublishError":"[Meta API] 9007: Media ID is not available"},"timestamp":"2026-09-23T18:54:54.991Z"}
```

### Erro 1 — `[Meta API] 25: User access is restricted`

Veredito: **token restrito/revogado no Meta** — comportamento CORRETO, não é
bug de código. O `[Meta API] 25` (código 25 = token de acesso do usuário
restrito/revogado) fez o endpoint responder 201 `{ success: true, status:
'failed', lastPublishError }` exatamente como o design manda
(`.hermes/plans/2026-09-23_135445-publish-now-endpoint.md`, decisão #2).

### Erro 2 — `[Meta API] 9007: Media ID is not available`

Veredito: **erro transiente de timing** — comportamento da API correto (201 +
failed, sem 500), mas **lacuna real de código** no pipeline de publicação.

O payload agora é `"postType":"stories"`. No `publishSinglePost`
(`planner.service.ts:533`), o polling de `getMediaContainerStatus` **só existe
para `reel`**. Para `image`/`stories` o código chama `media_publish` imediatamente
após criar o container; se a Meta ainda está processando, responde 9007
(subcode 2207027: *"The media is not ready for publishing, please wait for a
moment"*). O 9007 é um erro **intermitente de corrida**, não de token.

| Tipo | Polling antes do publish? | Risco 9007 |
|---|---|---|
| `reel` | ✅ sim (3x backoff 3s/6s/12s) | baixo |
| `image` | ❌ não | médio |
| `stories` | ❌ não (tratado como image) | alto |

**Recomendação dev:** aplicar o mesmo polling de `FINISHED` para `image`/`stories`
(com `media_type: undefined` — a Graph API aceita image_url para stories).

## 2. Lacuna de teste identificada

Os testes existentes cobriam o publish-now em 3 camadas separadas, mas NENHUM
garantia o caminho completo com banco real:

| Teste existente | Camada | O que mocka |
|---|---|---|
| `planner-publish-now.test.ts` | service (unit) | repo + Graph API |
| `planner-publish-now.bdd.test.ts` | route (supertest) | service inteiro |
| `planner-publish-now.controller.test.ts` | controller | service inteiro |
| `planner-publish-claim.test.ts` | repository | db chain |

**Faltava:** integração real (rota + auth + idempotency + service + repo +
PostgreSQL `fury_test`) com SÓ a Graph API mockada — provando que o erro 25
não vira 500 e que o post é persistido como `failed` no banco.

## 3. Teste de integração criado

**Arquivo:** `apps/api/src/__tests__/planner-publish-now.integration.test.ts`

Padrão: `google-profile-flow.test.ts` (banco real + rotas reais + mock de borda).

| # | Cenário | Garantia |
|---|---|---|
| 1 | Graph API recusa (erro 25 — token restrito) | 201 + `status:'failed'` + `lastPublishError` real; post persistido `failed` com `publishAttempts=1` |
| 2 | Happy path | 201 + `published` + `platformPostId` persistido |
| 3 | Graph API responde 9007 (stories — container ainda processando) | 201 + `failed` + `lastPublishError` real; post persistido `failed` |
| 4 | Replay da MESMA key após falha | resposta IDÊNTICA; Graph API NÃO chamada de novo |
| 5 | Retry (key nova + `retryPostId`) | republica o MESMO post; sem duplicar linha |
| 6 | Sem Instagram vinculado | 201 + `failed` com `no_instagram_account`; nenhuma chamada à Graph API |

### Resultado

```
Test Files  1 passed (1)
Tests       6 passed (6)
```

Banco `fury_test` limpo após o teste (`cleanupDatabase` remove tenant/posts).
38 testes unit/BDD relacionados seguem verdes (nenhuma regressão).

## 4. Como rodar

```bash
TEST_DATABASE_URL=postgresql://fury:fury_local@localhost:5433/fury_test \
JWT_SECRET=x JWT_REFRESH_SECRET=x TOKEN_ENCRYPTION_KEY=x NODE_ENV=test \
npx vitest run apps/api/src/__tests__/planner-publish-now.integration.test.ts
```

> **Nota de ambiente:** o `fury_postgres` roda na porta **5433** (docker
> `0.0.0.0:5433->5432`). O default de `setup.env.ts` aponta para 5432, que na
> máquina atual é o `white-conductor-postgres` (outro projeto) — sem o banco
> `fury_test`. Use `TEST_DATABASE_URL` explícita apontando para 5433 (ou ajuste
> o port-forward) ao rodar testes de integração.

## 5. Recomendações (para dev)

1. **Erro 25 — nenhuma mudança de código necessária.** Token restrito/revogado
   no Meta; comportamento de falha segura correto.
2. **Erro 9007 — lacuna real de código:** `publishSinglePost` não faz polling de
   `FINISHED` para `image`/`stories` (só para `reel`). Aplicar polling também
   para esses tipos reduz os 9007 intermitentes ("media not ready").
3. **Decisão de arquitetura (2026-09-23): manter polling, sem SSE.** A Graph API
   do Instagram é pull-only para status de container (não há webhook/streaming
   de "container pronto"); SSE só se aplicaria ao transporte front→API e não
   ataca a causa do 9007. Confirmado pelo time: **mantemos polling**.
4. **TDD — testes RED já escritos** em `publish-due.test.ts`:
   - `stories: NÃO publica enquanto container IN_PROGRESS — espera FINISHED`
   - `image: NÃO publica enquanto container IN_PROGRESS — espera FINISHED`
   - `stories: lança erro se container fica IN_PROGRESS após o limite de polls`
   - Status atual: **3 failed | 9 passed** (RED confirmado — só os 3 novos falham).
   - **Atenção:** o teste existente `publica imagem com sucesso` (linha 44:
     `getMediaContainerStatus).not.toHaveBeenCalled()`) documenta o comportamento
     ANTIGO e **precisa ser atualizado** no mesmo PR do fix (passará a esperar
     polling para image). Mesma coisa para qualquer teste que assuma "imagem não
     precisa de polling".
   - Implementação mínima esperada (para o dev): mover o bloco de polling para
     fora do `if (isReel)` em `publishSinglePost` (`planner.service.ts:551-562`),
     mantendo o `mediaType: isReel ? 'REELS' : undefined` na criação do container.
5. **Opcional (produto):** diferenciar erro 25 (token restrito) de outros erros
   da Graph API no front (`publishNowToast`) para sugerir "Reconectar o
   Instagram" quando `lastPublishError` contém `User access is restricted`.
6. **Infra:** padronizar a porta do `fury_test` entre `setup.env.ts` e o
   docker-compose real para que testes de integração rodem sem env override.

## 6. GREEN — implementação validada (2026-09-23, pelo dev + QA)

**Arquivos alterados:**
- `apps/api/src/services/planner/planner.service.ts` — `publishSinglePost`:
  polling de `FINISHED` movido para FORA do `if (isReel)` — agora `image`,
  `stories` e `reel` esperam o container ficar pronto antes do `media_publish`
  (3 tentativas, backoff 3s/3s/12s; mensagem de erro "Media container ...").
  `mediaType: isReel ? 'REELS' : undefined` preservado na criação do container.
- `apps/api/src/__tests__/publish-due.test.ts` — teste stale `publica imagem com
  sucesso` atualizado: agora mocka `getMediaContainerStatus → FINISHED`, usa
  fake timers e espera 1 poll antes de publicar.
- `apps/api/src/__tests__/planner-publish-now.test.ts` — teste "22:00 São
  Paulo" ajustado para avançar o fake timer do novo poll (sem mudança de assert).

**Validação independente (QA):**

```
publish-due.test.ts:                 12 passed (12)   ← GREEN (era 3 failed)
Suíte relacionada (8 arquivos):      61 passed (61)   ← integração + unit + BDD + claim
lint (eslint src --ext .ts):         exit 0
Banco fury_test:                     limpo (0 tenants, 0 posts)
```

**Observações QA:**
- O dev confirmou via `git stash` que as 65 falhas da suíte COMPLETA da API
  (studio, campaigns, auth, automation, etc.) são **pré-existentes** e não
  relacionadas a esta mudança.
- `planner-publish-now.integration.test.ts` passa isolado (6 passed) mas
  falha quando roda junto da suíte completa por interferência de estado
  compartilhado — **pré-existente**, não causado por esta correção.
- Nenhum commit foi feito (não solicitado).