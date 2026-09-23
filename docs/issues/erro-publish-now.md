{"success":true,"data":{"id":"7f1a2c12-daf7-40f9-8172-b498be5cf23b","status":"failed","lastPublishError":"[Meta API] 25: User access is restricted"},"timestamp":"2026-09-23T18:32:19.569Z"}

curl 'https://clickhero-hmg-fury-api.u7pe19.easypanel.host/api/planner/posts/publish-now' \
  -X POST \
  -H 'User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:154.0) Gecko/20100101 Firefox/154.0' \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' \
  -H 'Accept-Encoding: gzip, deflate, br, zstd' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 1ba5caa8-8244-489d-bc8a-26940778b25a' \
  -H 'Authorization: Bearer [REDACTED]' \
  -H 'Origin: https://clickhero-fury-web-hmg.u7pe19.easypanel.host' \
  -H 'Connection: keep-alive' \
  -H 'Referer: https://clickhero-fury-web-hmg.u7pe19.easypanel.host/' \
  -H 'Sec-Fetch-Dest: empty' \
  -H 'Sec-Fetch-Mode: cors' \
  -H 'Sec-Fetch-Site: same-site' \
  -H 'Priority: u=0' \
  -H 'TE: trailers' \
  --data-raw '{"caption":"aloo","postType":"stories","imageUrl":"https://pub-d99df9e660d547ae86921f86e8353d9e.r2.dev/f0a373f5-e49b-42f8-86c0-4240dbbebedc.png"}'


  # OUTRO ERRO DA API DA META
  {"success":true,"data":{"id":"0cd5fc8f-45c4-4c84-898e-afd9dcec1421","status":"failed","lastPublishError":"[Meta API] 9007: Media ID is not available"},"timestamp":"2026-09-23T18:54:54.991Z"}

---

## Análise QA (2026-09-23)

### Erro 1 — `[Meta API] 25: User access is restricted` (18:32)

**Causa:** token de acesso do usuário restrito/revogado no Meta (código 25).
O usuário (ou o Meta) removeu/restringiu o acesso do app FURY à conta do
Instagram. Não é bug de código — é o comportamento correto de falha segura:
HTTP 201 + `data.status: 'failed'` + mensagem real preservada, post persistido
como `failed` no banco. Resolução: **reconectar o Instagram** (token novo) e
verificar se a conta/perfil não está bloqueado no próprio Meta.

### Erro 2 — `[Meta API] 9007: Media ID is not available` (18:54)

**Causa raiz (diferente do erro 25):** erro **transiente de timing** da Graph
API. O `media_publish` foi chamado **antes do container de mídia terminar o
processamento** (`IN_PROGRESS`). A Meta documenta o subcode 2207027 como
*"The media is not ready for publishing, please wait for a moment"*.

O payload da curl agora é `"postType":"stories"`. No `PlannerService.publishSinglePost`
(`planner.service.ts:533`), o polling de status do container (`getMediaContainerStatus`)
**só existe para `reel`** (3 tentativas com backoff 3s/6s/12s). Para `image` e
`stories`, o código cria o container e chama `media_publish` **imediatamente** —
se a Meta ainda está processando, responde 9007.

| Tipo | Polling antes do publish? | Risco 9007 |
|---|---|---|
| `reel` | ✅ sim (3x backoff) | baixo |
| `image` | ❌ não | médio |
| `stories` | ❌ não (tratado como image) | alto |

**Classificação QA:** comportamento da API está correto (201 + failed, sem 500),
mas o **código de publicação tem uma lacuna real** para `image`/`stories`:
deveria aguardar `FINISHED` (com polling) antes do `media_publish`, como já faz
para `reel`. Sem isso, stories falha de forma **intermitente** (race de timing),
não por problema de token. Como o publish-now marca `failed` na hora (decisão de
produto: sem retry automático), o usuário precisa clicar "Tentar novamente" —
que, no retry imediato, provavelmente falha de novo com 9007 (mesma corrida).

**Recomendação para dev:** aplicar polling de `FINISHED` também para
`image`/`stories` em `publishSinglePost` (reaproveitar o loop existente do reel,
com `media_type: undefined` para stories — a Graph API aceita image_url para
stories). Isso elimina a causa mais provável do 9007 no publish-now.

  