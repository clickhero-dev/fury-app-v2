# Chat: voz e anexos privados (API Node)

## Contrato HTTP

Todos os caminhos abaixo têm prefixo `/api`. Usar bearer no header; nunca token na query.

| Método/caminho | Entrada | Sucesso |
| --- | --- | --- |
| `POST /chat/transcriptions` | multipart `audio` (1 arquivo) | `200 {text:string}` |
| `POST /chat/conversations/:conversationId/attachments` | multipart `files` (1–3 arquivos) | `201 {attachments:Attachment[]}` |
| `GET /chat/conversations/:conversationId/attachments/:attachmentId` | UUIDs | bytes, MIME verificado, `private, no-store`, `nosniff`, CSP sandbox |
| `DELETE /chat/conversations/:conversationId/attachments/:attachmentId` | UUIDs | `204`; somente rascunho, associado retorna `409` |
| `POST /chat/conversations/:conversationId/attachments/read` | JSON estrito `{attachmentIds:string[],question:string}` | `{readings:[{attachmentId,filename,content}],failures:[{attachmentId,message}]}` |
| `DELETE /chat/conversations/:conversationId/attachments` | UUID da conversa | `204` depois da limpeza; ativo/em upload retorna `409` |

`Attachment = {id,filename,mimeType,sizeBytes,pageCount?,durationSeconds?}`. Nunca inclui storage key, URL pública ou custos. IDs de leitura: UUIDs únicos, de 1 a 3; pergunta até 20.000 caracteres. Auth normal em todas as rotas. Delegação de Python (assinatura, issuer, audience, expiração existentes) permite **somente read e cleanup**, sem aprovar ações externas e sem habilitar ditado/upload/download/exclusão unitária. As rotas são montadas antes do proxy JSON, sem ampliar a allowlist dele.

Erros seguros: `400` validação; `401` auth; `403` tenant ausente/escopo delegado; `404` ownership ou anexo ausente (não revela outro usuário do mesmo tenant); `409` anexo associado/upload/run em andamento; `413` limite; `415` bytes inválidos/protegidos; `422` complexidade de decodificação; `429` rate/concurrency; `502` provedor; `503` storage/infra; `504` timeout do provedor. Falha individual de leitura aparece em `failures`, nunca em conteúdo fabricado.

## Limites e validação

- Ditado: 10 MiB/180s; áudio real decodificado para WAV PCM mono 16kHz. Silêncio digital/RMS muito baixo retorna `{text:""}` sem chamar IA. O áudio não é persistido como anexo.
- JPEG/PNG/WebP: 10 MiB, até 16 milhões de pixels, lados até 8192px; Sharp decodifica bytes completos. HTML/SVG, animações e corrupção são recusados.
- PDF: 20 MiB/20 páginas; Poppler identifica criptografia/páginas e renderiza **todas** as páginas em tamanho limitado. PDF escaneado é aceito; o leitor recebe o PDF original, não apenas texto extraído/raster de validação.
- MP4/WebM: 50 MiB/120s; FFprobe e FFmpeg validam container, dimensão, áudio e decodificação. WebM verifica o DocType EBML, não aceita MKV renomeado. MP4 comum com `moov` no final usa arquivo temporário privado seekable; as referências externas MOV são desabilitadas explicitamente. Vídeo sem faixa de áudio é identificado.
- Até 3 rascunhos e 60 MiB agregados por conversa; Python aplica novamente o teto por mensagem. Multipart chunked também é limitado durante a recepção, não só por Content-Length.
- Parsers nativos: executáveis fixos, sem shell/args do usuário, 20s de timeout, limites de CPU/address space/file size/open files via prlimit. Protocolos de entrada são `pipe` ou, para o MP4 temporário do servidor, `file` com demuxer MOV fixo e `enable_drefs=0/use_absolute_path=0`. Nenhum fetch de URL fornecida pelo usuário.
- Recepção multipart: 30s. Leitura/STT têm cancelamento ao desconectar e deadline de request de 65s; provedor tem 60s incluindo resolução de chave, fetch e leitura do body. Resposta upstream limitada a 128 KiB; evidência final até 12.000 caracteres por arquivo. Leitura de múltiplos arquivos é sequencial e pode retornar falha parcial ao esgotar o orçamento.
- Budget por instância: 20 chamadas de processamento/minuto por tenant+usuário e 4 requests simultâneos; não é um quota distribuído de billing.

## Persistência/concorrência

Migration `packages/db/migrations/0070_chat_attachments.sql`, registrada em `migrate.ts`, usa exatamente as colunas compartilhadas: id/tenant_id/user_id/conversation_id/message_id/filename/mime_type/size_bytes/storage_key/created_at/metadata. Foreign keys de conversa/mensagem usam RESTRICT para não órfanar objetos privados por cascade.

Todos os acessos a metadados passam pelo repository tenant+user-bound e JOIN com a conversa. Writers bloqueiam a mesma linha da conversa usada pelo `begin_run` Python. Dedup de rascunho usa SHA-256+nome seguro; índice único reforça exclusividade. Requests iguais nesta instância compartilham a operação; outra réplica que encontra reserva pendente recebe `409`, não cria cópia.

A reserva `metadata.uploadState="pending"` é commitada **antes** do put. Após confirmação do storage, muda para `"ready"`; só então o ID é retornado. Falha de compensação conserva a reserva para reconciliação. Python deve recusar bind de `pending` (já acordado com frente B). Downloads/reads também recusam pending/expirados.

`purgeExpired(tenantId,userId,conversationId)` é operação explícita e também roda no upload: elimina rascunhos de 24h e reservas interrompidas após 90s. Não há timer/job solto; limpeza periódica global futura exige BullMQ. Falha em remover bytes mantém metadados para retry.

Python mantém o row lock da conversa **durante** o cleanup delegado e a exclusão final. O controller Node distingue delegação verificada pelo guard (assinatura/issuer/audience/validade, não um header/claim fornecido pelo cliente) de autenticação humana. `cleanupDelegated` confirma ownership tenant+user, run inativo e uploads estáveis; remove **somente objetos privados**, sem `withConversation`/`FOR UPDATE` nem escrita em metadados. Apenas após **204** Python remove anexos, mensagens e conversa na mesma transação. Falha/timeout mantém as rows para retry. Upload, remoção de rascunhos e `begin_run` continuam serializados pelo lock Python; não existe intervalo desbloqueado entre limpeza e DELETE.

Cleanup humano mantém `withConversation` e é **somente para rascunhos**: qualquer anexo associado causa `409 CHAT_ATTACHMENT_BOUND` antes de tocar storage. Run ativo/upload em andamento também retornam `409`. Ter o bearer humano do dono, enviar `X-Chat-Delegated` ou um token com `actor` forjado não habilita a operação delegada. Exclusão unitária/cleanup são idempotentes para o dono enquanto a conversa existe.

## Configuração (não provisionada por esta implementação)

- `MODEL_CHAT_TRANSCRIPTION`: default `openai/whisper-large-v3-turbo`.
- `MODEL_CHAT_ATTACHMENT_READER`: default `google/gemini-2.5-flash`; precisa aceitar imagem/PDF/vídeo nativos e JSON. Modelo incompatível falha visivelmente, não cai para sumarização textual.
- Chave: resolução existente `resolveAiKey` dentro de `runWithTenant`, inclusive depois de Multer. Nenhuma chave do frontend e nenhum fallback de parceiro para chave alheia.
- Desenvolvimento: `CHAT_PRIVATE_STORAGE_DIR` **absoluto**, privado, fora de diretórios servidos/static/public e do frontend. Diretório 0700, objetos 0600, UUIDs opacos, O_NOFOLLOW e rejeição de symlinks. Não usar um path alcançável pelo Vite `/@fs` ou outro servidor estático.
- R2: `CHAT_PRIVATE_R2_BUCKET`, `CHAT_PRIVATE_R2_ACCOUNT_ID`, `CHAT_PRIVATE_R2_ACCESS_KEY_ID`, `CHAT_PRIVATE_R2_SECRET_ACCESS_KEY`, `CHAT_PRIVATE_R2_PRIVACY_CONFIRMED=true`.
- O operador só deve confirmar privacidade depois de desabilitar `r2.dev` e qualquer domínio público do bucket separado. O protocolo S3 não permite verificar essa configuração administrativa; **não foi provisionada/verificada externamente**. O bucket `fury-studio-assets` é sempre recusado, não há URL pública/presigned nem fallback público. Em produção a ausência de R2 dedicado confirmado resulta em 503; local não é fallback de produção.
- Dockerfile API instala `ffmpeg poppler-utils util-linux`. Um container descartável `node:22-alpine` confirmou os cinco executáveis de validação.

## Verificação reproduzível

A regressão de exclusão entre serviços está em
`apps/chat/tests/test_deletion_cross_service.py` (comando na seção de anexos do
`apps/chat/README.md`). Ela inicia `chat-deletion-cross-service-server.ts` usando
componentes Node reais e HTTP Python real no mesmo schema PostgreSQL descartável;
storage simulado, sem providers. É complementar aos testes por serviço abaixo e
falha se a URL descartável obrigatória não estiver configurada.

Não rodar a suíte API inteira: suites antigas podem acionar providers reais. Para os testes abaixo não são necessárias chaves nem arquivos de clientes.

```sh
# Criar DB descartável (NÃO reutilizar fury_dev/fury_test).
docker run --rm -d --name fury-chat-media-isolated \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=chat_media_isolated \
  -p 127.0.0.1::5432 postgres:16-alpine
docker port fury-chat-media-isolated 5432
# Usar a porta recém-informada em CHAT_MEDIA_TEST_DATABASE_URL, não TEST_DATABASE_URL.
cd apps/api
CHAT_MEDIA_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:PORT/chat_media_isolated \
  pnpm exec vitest run \
  src/__tests__/chat-attachment.repository.postgres.test.ts \
  src/__tests__/chat-media.routes.bdd.test.ts \
  src/__tests__/chat-media-validation.bdd.test.ts \
  src/__tests__/chat-private-storage.bdd.test.ts \
  src/__tests__/chat-attachment-reader.contract.test.ts \
  src/__tests__/chat-transcription.bdd.test.ts \
  src/__tests__/chat-proxy.bdd.test.ts \
  src/__tests__/chat-delegation.bdd.test.ts \
  src/__tests__/chat-delegation-guard.bdd.test.ts
pnpm exec tsc --noEmit
# Testes excluídos do tsconfig principal: lint sem parser project nesse comando.
pnpm exec eslint --parser-options '{"project":null}' \
  src/__tests__/chat-media*.ts src/__tests__/chat-attachment*.ts \
  src/__tests__/chat-private-storage.bdd.test.ts src/__tests__/chat-transcription.bdd.test.ts
# Remover somente o container que você acabou de criar.
docker rm -f fury-chat-media-isolated
```

Execução realizada: **82 testes passaram, 9 arquivos** (Postgres descartável, storage local real, Sharp/FFmpeg/Poppler reais; HTTP do provedor e R2 mockados). PDF protegido é fixture criptografada genuína; o teste comprova que pdfinfo abre com senha sintética antes de exigir rejeição sem senha. Typecheck temporário incluindo os sete arquivos de testes/fixture e os fontes de mídia, lint fontes/testes e `git diff --check` passaram. O `tsc --noEmit` global passou antes de uma alteração paralela da frente D; na última execução encontrou `chat-plan-errors.ts:10` (`Object.hasOwn` não disponível no target ES2020), reportado ao parent sem edição fora de escopo. Nenhuma migration foi aplicada a DB existente, nenhuma chamada paga/provisionamento externo ocorreu, nenhum package/lockfile mudou.

Fontes primárias verificadas para o wire contract: repositório oficial `OpenRouterTeam/docs`, `guides/overview/multimodal/{stt,videos,pdfs}.mdx`. STT envia `input_audio.data` base64 bruto; Chat Completions envia `image_url`, `file.file_data` com engine PDF `native`, ou `video_url.url` data URI. Testes verificam JSON, URL fixa, headers, limite, erros e cancelamento. **Isso não prova qualidade visual/transcrição ao vivo**: smoke pago com fixtures sintéticas e validação do bucket real continuam gates de implantação autorizada.
