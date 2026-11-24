# QA — [N1] Foto do estúdio estranha — reteste E2E, 18/11/2026

Card `1dfch0ammb3`; PR #434; head avaliado após integrar `origin/hmg` (`4b684f24`). Resultado: **E2E automatizado aprovado; entrega ainda não pronta para merge**.

## Conflitos e correções

- A atualização de `hmg` revelou conflitos em `apps/web/e2e-mock/chat-media.spec.ts`, `chat-redesign.spec.ts` e `chat.spec.ts`. Foram reconciliados os seletores do vídeo, a abertura do modal e as verificações de carregamento da imagem e fechamento do modal. A regressão relacionada passou em todos os 45 cenários dos três arquivos.
- A execução inicial do E2E do estúdio abriu um servidor Vite preexistente do chatbot na porta 5175 porque o config permitia reutilização. Os dois cenários falharam por não encontrar os controles da Criação Rápida. `playwright.studio.config.ts` foi isolado na porta 5176 e passou a sempre iniciar seu próprio servidor. No reteste, os dois cenários passaram.
- Merge de `origin/hmg` limpo após resolver os três conflitos. `git diff --check` sem erros.

## Validação local

- `pnpm exec playwright test --config playwright.studio.config.ts` em `apps/web`: **2 passaram**, incluindo frase explícita e fallback do aprimoramento com opção sem texto.
- `pnpm exec vitest run apps/api/src/__tests__/studio-ai.service.test.ts apps/api/src/__tests__/studio-ai.controller.test.ts apps/api/src/__tests__/studio-image-openrouter.test.ts apps/web/src/pages/estudio/quick-create-text.test.ts`: **55 testes passaram** em quatro arquivos. Foi necessário compilar `@fury/shared` e `@fury/db` antes, pois as entradas compiladas não existiam no worktree limpo.
- Regressão de navegador dos três arquivos em conflito, via `CHAT_E2E_WEB_URL=http://127.0.0.1:5177 pnpm exec playwright test --config playwright.chat-mock.config.ts ...`: **45 passaram**. A porta 5175 já estava ocupada por outro servidor local; a regressão foi executada isoladamente na 5177.

O E2E do estúdio continua usando APIs simuladas. Foram observados erros de console em consultas auxiliares sem mocks e no carregamento de uma imagem GIF fictícia inválida. O fluxo e os payloads esperados passaram; isso não comprova geração nem qualidade da imagem.

## Pendências de aceite

Continuam sem evidência: três gerações reais e avaliação visual humana da identidade, idioma e legibilidade; upload, leitura em storage e isolamento entre tenants reais de teste; e identificação do request original do relato. O histórico aponta que a jornada real já falhou por cota de QA esgotada. As validações simuladas não comprovam esses critérios. Manter a PR em rascunho até ambiente e cota de teste apropriados, integrações exercitadas e CI verde no SHA final. Não declarar causa raiz do sintoma visual.

O grafo `code-review-graph` indicado no `AGENTS.md` não estava disponível nas ferramentas desta sessão; os conflitos e impactos foram verificados diretamente no diff e nos testes.
