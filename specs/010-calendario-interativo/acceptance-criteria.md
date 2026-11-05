# Acceptance Criteria: Calendário Editorial (FR8 + GAP-2)

## CA-01: Publicação de post com imagem no Instagram

- [ ] **Dado** que existe um post com `status = 'approved'`, `postType = 'image'`, `scheduledAt <= now()`, e `imageUrl` preenchida
  **Quando** o cron executa `POST /planner/cron/publish-due`
  **Então** o post é publicado no Instagram feed da primeira página vinculada ao tenant
  **E** `status` muda para `'published'`
  **E** `publishedAt` é preenchido com timestamp atual

## CA-02: Publicação de reel (vídeo) no Instagram

- [ ] **Dado** que existe um post com `status = 'approved'`, `postType = 'reel'`, `scheduledAt <= now()`, e `imageUrl` contendo URL de vídeo
  **Quando** o cron publica
  **Então** um media container é criado via `POST /{ig-user-id}/media`
  **E** o status do container é monitorado até `FINISHED`
  **E** o container é publicado via `POST /{ig-user-id}/media_publish`
  **E** `status` muda para `'published'`

## CA-03: Retry na primeira falha (backoff 1 minuto)

- [ ] **Dado** que um post falha ao publicar (erro de rede, rate limit, etc.)
  **Quando** o erro ocorre na primeira tentativa (`publishAttempts = 0`)
  **Então** `publishAttempts` incrementa para 1
  **E** `nextRetryAt` é `now() + 1 minuto`
  **E** `lastPublishError` contém a mensagem de erro
  **E** `status` permanece `'approved'`

## CA-04: Retry com backoff progressivo

- [ ] **Dado** que um post já falhou 1 vez (`publishAttempts = 1`)
  **Quando** `nextRetryAt <= now()` e o cron reexecuta
  **E** falha novamente
  **Então** `publishAttempts` incrementa para 2
  **E** `nextRetryAt` é `now() + 5 minutos`

## CA-05: Falha definitiva após 3 tentativas

- [ ] **Dado** que um post já falhou 3 vezes (`publishAttempts = 3`)
  **Quando** o cron reexecuta e falha novamente
  **Então** `status` muda para `'failed'`
  **E** `lastPublishError` contém a mensagem do último erro
  **E** `nextRetryAt` é limpo (NULL)
  **E** o post NÃO é mais reprocessado

## CA-06: Tenant sem Instagram conectado

- [ ] **Dado** que um tenant tem posts a publicar
  **Quando** não há nenhuma página com Instagram vinculado no `selectedPageIds`
  **Então** a publicação é silenciosamente ignorada (`published: 0`)
  **E** nenhum erro é lançado
  **E** o status do post NÃO é alterado

## CA-07: Token Meta expirado

- [ ] **Dado** que o access token do tenant está expirado ou revogado
  **Quando** o cron tenta publicar
  **Então** o erro é capturado
  **E** `publishAttempts` incrementa
  **E** `lastPublishError` contém "token expirado"

## CA-08: Migrations aplicadas

- [ ] **Dado** que a migration é executada
  **Quando** verifico a tabela `social_posts` no banco
  **Então** as colunas `publish_attempts` (INT, default 0), `last_publish_error` (TEXT), `next_retry_at` (TIMESTAMPTZ) existem

## CA-09: GAP-2 — CreatePostDialog com date+time separados

- [ ] **Dado** que o usuário abre o diálogo "Novo post"
  **Quando** preenche o agendamento
  **Então** o campo é composto por dois inputs: `type="date"` (label "Data") + `type="time"` (label "Hora")
  **E** NÃO existe `type="datetime-local"` no formulário

## CA-10: Testabilidade — publishSinglePost é função pura

- [ ] **Dado** que `publishSinglePost` recebe `(post, igUserId, accessToken)`
  **Quando** executada com um mock de `metaApiCall`
  **Então** retorna `{ success: true }` para imagem
  **E** lança erro com mensagem descritiva para falha de rede
  **E** não acessa `db` diretamente (recebe tudo por parâmetro)
