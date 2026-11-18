# Serviço de chat (em desenvolvimento)

Crie um ambiente Python 3.12 e instale `requirements.txt` (ou `requirements-dev.txt` para executar testes). Configure no ambiente ou em `apps/chat/.env` as variáveis `DATABASE_URL`, `CHAT_DELEGATION_SECRET`, `ADY_API_URL`, `OPENROUTER_API_KEY` e `MODEL_CHATBOT`. `POSTHOG_API_KEY` e `POSTHOG_HOST` são opcionais para telemetria sanitizada. O segredo de delegação deve ser o mesmo da API e ter pelo menos 32 caracteres. Inicie em `apps/chat` com `uvicorn app:app --port 8000`; o serviço deve permanecer acessível apenas pela API principal.

Execute os testes com `PYTHONPATH=apps/chat pytest apps/chat/tests`. O gate completo
usa PostgreSQL **descartável** em loopback, banco com sufixo `_isolated`, nunca
banco de cliente. Configure `CHAT_MEDIA_TEST_DATABASE_URL` e
`CHAT_OUTCOME_TEST_DATABASE_URL`; esta última é obrigatória para as regressões de
confirmação com journal real. Para cobrir também os testes legados globais, aplique
as migrations nesse banco e configure `CHAT_TEST_DATABASE_URL` e
`CHAT_TITLE_TEST_DATABASE_URL`. O gate `scripts/ci/chatbot-gate.py` prepara esse
ambiente automaticamente. Use `PYTHON_DOTENV_DISABLED=1` para não carregar segredos locais.

### Refinamento proativo e recuperação

Spec de produto e limites: [`specs/ady-proativo-resiliente/spec.md`](../../specs/ady-proativo-resiliente/spec.md).
O Ady prepara ideias, legendas e organização em rascunho sem exigir briefing de
marketing. A política e as quatro skills editoriais ficam em `assistant_policy.py`;
a versão da política integra os checkpoints. A confirmação de custo/publicação
permanece no backend. Instruções ao modelo não garantem qualidade editorial:
homologação com negócios reais continua necessária.

Aplique as migrations `0080`, `0081` e `0082` com o runner **antes** de
subir esta versão. Contexto efetivo é salvo antes do agente; retomadas podem usar
o snapshot mesmo depois da compactação da conversa. Consultas estáveis confirmadas
são reutilizadas apenas no mesmo turno original, após consultar novamente a
rota original para revalidar autorização e acesso ao recurso. Sem essa confirmação,
o cache não é devolvido. Cotas e jobs continuam sendo consultados ao vivo.
Dados em cache não substituem a revalidação de acesso,
snapshot do recurso e confirmação exigida para executar uma ação.

Snapshots não contêm tokens/headers e estão isolados por conversa e proprietário,
com lease/fencing; são removidos com a conversa. Limites: 1 MiB de contexto e
128 KiB por resultado de ferramenta. O runtime omite padrões de credenciais do
histórico antes de enviá-lo ao modelo/snapshot; mensagens brutas continuam no
histórico privado existente. O repositório recusa credenciais não sanitizadas.
Payload incompatível ou erro de persistência interrompe a resposta de forma segura,
sem alegar sucesso.
Não há gravação de tokens parciais nem replay automático de mutações. Retomada
continua somente leitura; conversas legadas compactadas sem snapshot permanecem
protegidas pelo erro `retry_compacted`. Um snapshot não recria mensagens/runs que
já tenham sido removidos pelas políticas de compactação existentes.

Fallback de modelo é opt-in, configurável e limitado às mesmas três tentativas
totais por requisição, sem replay após saída/ferramentas. Consulte
[`docs/operations/chat-provider-fallback.md`](../../docs/operations/chat-provider-fallback.md).
Sem homologação explícita, mantém-se o modelo principal. Falha do próprio
OpenRouter não é resolvida por trocar o modelo no mesmo gateway.

O worker de turnos na API recupera respostas após reinício a partir do banco,
com delegação JIT e limites globais persistidos. A interface acompanha o estado
mesmo sem stream aberto. Cancelamento impede próximas etapas, não desfaz efeito
externo. Confirmação individual/lote compartilham claims e resultado duráveis;
exigem `humanIntent` assinado pelo proxy, nunca fornecido pelo modelo ou body.
Planos aceitam referências tipadas entre resultados, com revalidação da mídia
no tenant atual. Aprovar plano continua sem autorizar custo ou publicação.

Detalhes e rollout:
- [`docs/operations/ady-recovery-and-approvals.md`](../../docs/operations/ady-recovery-and-approvals.md)
- [`docs/operations/ady-editorial-evaluation.md`](../../docs/operations/ady-editorial-evaluation.md)

Ainda dependem de operação real: homologação editorial com empresários, coleta
de latência/custo reais dos modelos e rollout controlado. O CLI de avaliação não
faz chamadas pagas nem aprova modelos a partir de amostras sintéticas.

Para executar o chat em container local, defina `CHAT_DELEGATION_SECRET` (igual ao da API) e `OPENROUTER_API_KEY` no ambiente, inicie a API na porta 3000 e execute `docker compose -f infra/docker-compose.yml --profile chat up --build chat`. O serviço fica acessível apenas em `127.0.0.1:8000`. Se necessário, configure `CHAT_DATABASE_URL` e `ADY_API_URL` para apontar ao banco e à API acessíveis pelo container; aplique as migrações antes de usá-lo.

Antes de produção, concluir a homologação e o checklist de rollout. O fluxo cobre
consultas de campanhas, anúncios, calendário, marca e mídias; propostas confirmadas
para imagens, vídeos, campanhas, anúncios, postagens e atualizações do negócio.
A retomada automática é somente leitura e preserva propostas anteriores, sem
reexecutar efeitos incertos. Jobs de vídeo são reconciliados ao consultar a conversa.
A compressão considera memória, histórico, instruções e schemas Agno com tokenizer
nativo DeepSeek V4 Pro, margem por item e reserva de 4.096 tokens para resposta;
outros modelos usam limite conservador por bytes. A formatação final do provedor
pode diferir da estimativa.

O tokenizer em `tokenizer/` é do repositório oficial DeepSeek-V4-Pro, revisão `b5968e9190ef611bbf34a7229255be88a0e937c1`, distribuído sob a licença incluída.

Alterações de campanhas e anúncios conferem o snapshot imediatamente antes da chamada à Meta e são serializadas entre réplicas do chatbot por bloqueio PostgreSQL. A Meta ou outras rotas podem alterar o recurso entre a conferência e a atualização.

SHA-256 do tokenizer: `8f9f37ca37fdc4f5fd36d5cf4d3b0e8392edb4e894fd10cc0d70b4957c8633cf`.

### E2E de aprovação com serviços reais

O teste `apps/web/e2e-mock/chat-real.spec.ts` cria e remove um tenant de teste em um PostgreSQL **isolado**, confirma pela interface uma proposta de agendamento e verifica que API e FastAPI persistiram exatamente uma postagem. Ele também retoma uma resposta interrompida com o modelo simulado em `apps/chat/tests/e2e_server.py`, sem duplicar a mensagem ou criar outra aprovação. A conexão Meta e o aceite de política são simulados para passar os gates de navegação; o fluxo de chat, autorização delegada e banco é real. As atualizações de perfil e marca usam as implementações reais; geração e edição de imagem, criação e ajuste de jobs de vídeo e operações de campanha/anúncio são substituídas no nível de serviço em `apps/api/src/chat-e2e-server.ts`. Assim, o E2E valida interface, delegação, guard, controllers e persistência das aprovações, mas não valida provedor, armazenamento ou regras internas dos serviços substituídos. O cancelamento de agendamento é validado pela API e pelo PostgreSQL reais. Não há chamada ao OpenRouter ou publicação externa nesse cenário.

1. Crie um banco descartável e execute `DATABASE_URL=<url-do-banco-isolado> npm run db:migrate` na raiz.
2. Inicie o servidor de teste com `python apps/chat/tests/e2e_server.py`, apontando `DATABASE_URL` para esse banco, `ADY_API_URL` para a API, e `CHAT_DELEGATION_SECRET` para um segredo de teste com pelo menos 32 caracteres.
3. Inicie a API de teste com `NODE_ENV=test` e `pnpm exec tsx src/chat-e2e-server.ts` em `apps/api`, usando o mesmo `DATABASE_URL` e `CHAT_DELEGATION_SECRET`, `CHAT_SERVICE_URL` apontando ao FastAPI e `JWT_SECRET` definido para um segredo de teste. Inicie o Vite com `VITE_API_URL` apontando à API, incluindo `/api`.
4. Em `apps/web`, execute `CHAT_E2E_DATABASE_URL=<url-do-banco-isolado> CHAT_E2E_JWT_SECRET=<jwt-de-teste> CHAT_E2E_WEB_URL=<url-do-vite> pnpm exec playwright test -c playwright.tickets.config.ts chat-real.spec.ts`. O `CHAT_E2E_JWT_SECRET` deve ser o mesmo `JWT_SECRET` da API. Instale o Chromium do Playwright antes da execução. Sem essas três variáveis o teste é marcado como skip.

Este E2E é gate no job `test-unit` do CI, que inicia os três serviços com segredos sintéticos e PostgreSQL isolado, aguarda os healthchecks e encerra os processos ao terminar.

Uma ação síncrona com resultado incerto não é reenviada automaticamente. Execuções sem conclusão por mais de cinco minutos aparecem como resultado indeterminado; consulte o recurso antes de solicitar outra ação.

### Título automático e SSE

Após a primeira resposta concluída, a geração do título roda isolada, sem ferramentas,
com prazo de quatro segundos; em caso de falha, usa a primeira mensagem. O evento
`done` continua marcando a resposta concluída e não espera a IA do título. Quando o
UPDATE condicional é bem-sucedido, o stream pode emitir **depois de `done`**:

```text
event: title
data: {"id":"<conversation UUID>","title":"<título persistido>"}
```

Consumidores interessados devem continuar lendo até o encerramento do stream. O evento
é opcional (renomeação manual, desconexão ou erro de persistência podem suprimi-lo);
`GET /conversations` ou `GET /conversations/{id}` recupera o título persistido. Uma
renomeação manual sempre prevalece, inclusive quando o novo título é `Nova conversa`.
Conversas anteriores à migração ficam protegidas e não são renomeadas automaticamente.

### Anexos privados no chat

`POST /conversations/{id}/messages` aceita `{content?: string, attachmentIds?: string[]}`:
texto até 20.000 caracteres, até três UUIDs distintos e pelo menos texto não branco ou
um anexo. Uma mensagem só com anexos persiste texto vazio; o pedido de descrição é
interno. Vínculo, mensagem e response run são atômicos e scoped por tenant **e** usuário;
rascunhos com 24 horas, upload `pending`, reuso e agregado acima de 60 MiB são recusados.
O retry usa o `user_message_id` original e nunca associa IDs enviados no body de retry.

`GET /conversations/{id}` inclui `messages[].attachments` com `id`, `filename`,
`mimeType`, `sizeBytes` e, quando disponíveis, `pageCount`/`durationSeconds`. Não expõe
storage keys nem URLs. A migration `0070_chat_attachments.sql` pertence à API/DB.

O serviço chama `POST ${ADY_API_URL}/api/chat/conversations/{id}/attachments/read`
com o Bearer delegado da requisição. O modelo textual recebe somente evidências
identificadas como dados não confiáveis; não recebe arquivo/URL nem instruções do
arquivo como system prompt. Timeout, resultado parcial, IDs inesperados, conteúdo
vazio/excessivo ou erro HTTP interrompem o run com `event: error` citando o arquivo;
nenhuma resposta é fabricada. Novo retry relê os mesmos anexos.

Releituras ficam restritas à conversa: até três arquivos/60 MiB, priorizando anexos da
mensagem atual, nomes/IDs citados e depois os mais recentes. Os demais são explicitados
na resposta. Leituras têm limite de 20.000 caracteres por arquivo e 256 KiB por resposta
HTTP. A compactação preserva as mensagens que ancoram anexos no histórico e marca
`metadata.chatMessageCompacted=true` para não reenviar o texto já resumido ao agente.
A memória derivada de conversas com anexos não é compartilhada com outras conversas.

**Contrato de exclusão entre serviços:** Python mantém o row lock da conversa durante
o `DELETE ${ADY_API_URL}/api/chat/conversations/{id}/attachments` privado e só remove
metadados/mensagens após receber **204**. O guard Node verifica assinatura, issuer,
audience e validade da delegação; `cleanupDelegated` verifica ownership tenant+user,
remove somente os objetos e **não readquire esse row lock nem remove metadados**.
Upload e remoção de rascunhos do Node usam o mesmo row lock para serializar com a
exclusão. Cleanup humano permanece sob lock e recusa qualquer anexo associado com
`409 CHAT_ATTACHMENT_BOUND`, mesmo se o cliente tentar simular delegação via headers.
A exclusão com qualquer run ativo retorna 409; o envio simultâneo de mensagens é permitido.
O GET da conversa fornece `response_runs` com `id`, `user_message_id`,
`assistant_message_id` e `status`; `response_run` permanece para clientes antigos.
O SSE começa com `run` e encerra com `done`, ambos identificando `run_id` e
`user_message_id`. Para retentar uma resposta específica, use `POST .../retry?run_id=<id>`;
a retomada continua somente de leitura. **Rollout sem versões mistas:** interrompa novos
requests e drene todos os workers antigos (inclusive runs em andamento) antes de aplicar
`0072`; em seguida inicie apenas workers novos e reabra o tráfego. O worker antigo não
salva `assistant_message_id` e não é compatível com envios concorrentes; não faça
rolling deploy misturando versões nem rollback para ele após habilitar concorrência.
A migration associa apenas respostas legadas com vínculo temporal inequívoco; vínculos
ambíguos ficam ausentes do contexto causal, inclusive anexos. A compactação não altera histórico durante runs ativos e
só resume turnos intercalados com vínculos completos. Falha/timeout de cleanup retorna 502 pelo FastAPI preservando
as rows. Conversas sem anexos não chamam storage. Não há liberação antecipada do
lock Python nem intervalo para nova associação antes da exclusão final.

Regressão obrigatória Python→Node com PostgreSQL compartilhado descartável (Python
3.12, dependências Node do workspace e `pytest asyncpg httpx` instalados):

```sh
PYTHON_DOTENV_DISABLED=1 PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=apps/chat \
CHAT_MEDIA_TEST_DATABASE_URL=postgresql://<usuario>@127.0.0.1:<porta>/chat_media_isolated \
python -m pytest apps/chat/tests/test_deletion_cross_service.py -v \
  --junitxml=chat-deletion-cross-service.xml
```

Rodar da raiz. A URL é obrigatória, restrita a `127.0.0.1` e banco `*_isolated`;
ausência/configuração insegura **falha**, não pula o gate. Cada cenário aplica as
migrations compartilhadas num schema único e inicia Node em porta aleatória de
loopback, com ambiente reduzido, dotenv desabilitado e segredos sintéticos locais.
O teste usa `ConversationRepository.delete` e `AttachmentClient.cleanup` reais,
HTTP real, guard/auth/controller/service/repository Node reais e o mesmo PostgreSQL;
apenas o storage é simulado (sem provider, Redis ou FastAPI/Express de produção
completos). Cobre sucesso sem relock, falha preservando rows/retry, tenant/user,
metadados intactos no Node delegado, humano/assinatura falsa e lock humano para
rascunhos. O harness Node é `apps/api/src/__tests__/chat-deletion-cross-service-server.ts`;
o subprocesso e o schema pertencentes ao cenário são encerrados no teardown.

#### Testes de mídia sem serviços externos

```sh
PYTHON_DOTENV_DISABLED=1 PYTHONPATH=apps/chat \
CHAT_MEDIA_TEST_DATABASE_URL=postgresql://<usuario>@127.0.0.1:<porta>/<banco-descartavel> \
python -m pytest apps/chat/tests/test_attachments.py \
  apps/chat/tests/test_attachments_postgres.py apps/chat/tests/test_attachment_context.py \
  apps/chat/tests/test_attachment_service.py apps/chat/tests/test_attachment_deletion.py \
  apps/chat/tests/test_attachment_memory.py -q -o asyncio_default_fixture_loop_scope=function
```

A fixture cria schemas únicos, aplica as migrations reais de chat e remove somente o
schema que criou. A URL deve apontar para PostgreSQL descartável, nunca banco de cliente.
O serviço FastAPI, SQL/transações e httpx são reais; o Node/leitor e o agente são
simulados no transporte. Esses testes não comprovam capacidade multimodal do provedor;
o smoke externo e o build Docker pertencem ao gate de integração. Para a suíte legada,
`CHAT_TEST_DATABASE_URL` deve apontar a um banco descartável com migrations aplicadas;
`CHAT_TITLE_TEST_DATABASE_URL` habilita também o teste real dos títulos.

### Continuidade e falhas do provedor (#452)

O transporte OpenRouter repete somente a requisição atual, no máximo onze tentativas
(uma inicial e dez retries),
antes de qualquer saída ou ferramenta observada no turno. Uma requisição nova com
resultado de ferramenta também pode ser repetida antes de entregar sua própria
saída: apenas o HTTP é repetido, não a ferramenta. Timeout/conexão, 429 e 5xx
usam backoff exponencial com jitter; `Retry-After` aceita segundos ou data HTTP. O
orçamento acumulado de espera é 120 segundos e o de retry da requisição é 300 segundos.
Uma espera indicada maior que o orçamento encerra sem antecipar o retry. Erros de
requisição, autenticação, cobrança e contexto não são repetidos automaticamente.

O agente e suas ferramentas têm prazo total de 240 segundos. EOF sem término SSE,
`finish_reason: error`, saída truncada por limite ou filtro geram erro recuperável pelo
tratamento de run existente. Não se reinicia o mesmo stream depois de entregar
conteúdo parcial; a recuperação de turno usa o `user_message_id` original e
preserva propostas, sem repetir ações externas. O deadline cobre a execução
do agente; preparação/compressão de contexto mantém seus limites HTTP existentes.

Logs `provider_attempt` correlacionam request UUID local, run UUID, modelo validado,
tentativa, status e fases `initial_failure`, `retry`, `recovered`, `final_failure`.
Não incluem corpo, credencial nem conteúdo de conversa. `recovered` indica aceitação
do transporte após retry; falha posterior do stream segue a telemetria de falha de run.
A configuração usa `MODEL_CHATBOT`; “Evo” ainda precisa ser identificado com evidência
operacional. Os testes demonstram falhas controladas, não a causa do relato em produção.

O setup guiado requer as migrations `0084` a `0087`. Cada turno captura a etapa
antes do modelo e registra o avanço com um recibo atômico por mensagem; uma
retomada devolve o recibo e não avança novamente. Uma etapa alterada por outra
execução após a captura é rejeitada. A ferramenta de resposta só fica disponível
quando a pergunta exibida corresponde à pergunta canônica da etapa, e aceita
apenas o texto enviado pela pessoa; caso contrário, é preciso confirmar novamente.
Se a tabela ou o snapshot estiverem
indisponíveis, o chat normal continua, mas a resposta guiada não é aplicada.
O recibo guarda as versões do perfil observadas quando o nome foi confirmado,
antes do modelo. A API valida
o recibo e o lease, confere essas versões e registra o efeito na mesma transação
da atualização. A chave do efeito é a mensagem original, não o run; uma
retomada pode reconciliar com segurança inclusive uma resposta HTTP perdida.
Se o perfil mudou, o serviço recusa a atualização e solicita conferência;
configurações antigas sem versões preservam as respostas, mas exigem revisão
e confirmação pelo fluxo normal de perfil. Uma falha transitória
de sincronização esgotada agenda recuperação do turno, dentro dos limites
duráveis existentes, em vez de declarar a atualização concluída.

**Rollout:** aplique as migrations antes dos serviços e atualize API e chat
em uma janela coordenada, sem aceitar respostas guiadas de instâncias antigas.
O contrato anterior não carrega lease nem chave de idempotência: a API nova o
recusa, pois não é possível validá-lo com segurança. O chat novo trata a
rejeição de validação da API antiga como transitória, sujeita ao orçamento de
recuperação; não dependa dele para cobrir um deploy prolongado.
