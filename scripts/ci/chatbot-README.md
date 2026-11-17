# Chatbot CI (sem provedor)

Check dedicado: **Chatbot / real DB, E2E and image** em `chatbot.yml`.
Executa em pushes de `feat/422-chatbot-ready`, `dev`, `hmg` e `main`, em PRs
para `dev`/`hmg`/`main`, ou manualmente por `workflow_dispatch`.

## Executar localmente

Pré-requisitos: Docker disponível, Node 22, pnpm, Python **3.12** e Chromium.
Na raiz do checkout:

```sh
pnpm install --frozen-lockfile
(cd apps/web && pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true)
python3.12 -m venv "$TMPDIR/chatbot-ci-venv"
"$TMPDIR/chatbot-ci-venv/bin/python" -m pip install -r apps/chat/requirements-dev.txt
(cd apps/web && pnpm exec playwright install --with-deps chromium)
python3 scripts/ci/chatbot-contract.test.py
CHATBOT_ARTIFACT_DIR="$TMPDIR/chatbot-ci-evidence" \
  "$TMPDIR/chatbot-ci-venv/bin/python" scripts/ci/chatbot-gate.py
```

Se `TMPDIR` não estiver definido, escolha antes um diretório de scratch próprio.
Para repetir um estágio: `--phase image`, `--phase python`, `--phase api` ou
`--phase e2e`. Cada execução cria recursos descartáveis e aplica migrations reais;
não forneça URLs ou credenciais existentes. Não execute dois gates simultaneamente:
o teste legado de queda do Redis exige o nome `fury-chat-recovery-outage-test`.
Colisão nesse nome falha sem parar/reutilizar o container existente.

## Cobertura e limites

- Build da imagem `apps/chat/Dockerfile`, startup pelo entrypoint de produção e
  leitura/assert do OpenAPI servido. Nenhuma montagem do source no container.
- Python completo, incluindo DB de mídia, títulos e outcomes; Python 3.12 obrigatório.
- API `chat-*.test.ts`, migração WhatsApp, contrato HTTP de vídeo e `studio-video-*`.
  Arquivos são sequenciais para evitar interferência DB/Redis. DB tem nome
  `chatbot_ci_isolated`, host literal `127.0.0.1`; Redis usa DB 15 e URLs idênticas.
- Todos `e2e-mock/chat*.spec.ts`, separando mock e `chat-real.spec.ts`. Os próprios
  specs de redesign exercitam desktop/mobile light/dark. FastAPI e API são reais
  no segundo estágio; apenas modelo e os serviços externos documentados no harness
  são simulados. Isso não comprova capacidades ou disponibilidade de provedores.
- Qualquer skip, relatório vazio, erro de execução ou healthcheck falha o gate.
- Logs, inventário de testes API, JUnit, screenshots, traces de falha e OpenAPI
  ficam em `CHATBOT_ARTIFACT_DIR` (default `.chatbot-ci`). CI publica sempre os
  artefatos, inclusive em falha. Teardown termina grupos próprios, coleta logs e
  remove/verifica somente containers criados pela execução.
- Variáveis do caller não passam aos subprocessos, salvo runtime plumbing; envs
  reais de dotenv/Vite ficam desabilitados e segredos são exclusivamente sintéticos.

## Hook para regressão entre serviços

O gate descobre automaticamente `apps/chat/tests/test_*.py` e
`apps/api/src/__tests__/chat-*.test.ts`. A regressão Python→Node nova deve usar esses
padrões e as URLs `CHAT_MEDIA_TEST_DATABASE_URL`/`CHAT_TEST_DATABASE_URL` já fornecidas.
Se o teste novo precisar de outro env/comando, conectá-lo explicitamente antes da
validação integrada; não existe placeholder que alegue executar um teste inexistente.

O workflow não modifica branch protection. Tornar esse check obrigatório e rodar
Actions remotamente depende de publicação/configuração autorizada no GitHub.
