# QA E2E — [N3] status dos tickets — 18/11/2026

Card: [1dfch0anara](https://app.clickup.com/t/1dfch0anara). PR: [#478](https://github.com/clickhero-dev/fury-app-v2/pull/478). Execução no head `52afad659c3816ff643865780db469ad6caf7558`, em worktree isolado criado a partir da ref da PR.

## Cenário validado

O Playwright `e2e-mock/tickets-status-recovery.spec.ts` verificou a tela administrativa quando a consulta de status retorna 502: mensagem de erro visível, seletor e confirmação desabilitados, ação de nova tentativa, carregamento de opções válidas e habilitação da confirmação após selecionar um status. Também verificou ausência de erros de página.

Resultados no head da PR:

- Playwright: 1/1 passou (`recupera status no diálogo administrativo`).
- Vitest API (`ticket-status-resilience.bdd`, `ticket-status-telemetry.bdd`, `ticket-status-exception.bdd`): 29/29 passou.
- Vitest web (`TicketsPage.test.tsx`): 30/30 passou.
- GitHub Actions: CI monorepo, Chatbot e QA jornada real concluíram com sucesso no head registrado pela PR.

O E2E intercepta e simula as respostas HTTP. Não comprova a integração real navegador → API → ClickUp, nem uma alteração de status persistida.

## Obstáculos e resolução

1. A primeira execução no worktree isolado falhou porque o pnpm recusou um symlink de `node_modules` apontando para outro checkout (`ERR_PNPM_UNSAFE_MODULES_DIR`). Removi os symlinks criados apenas no worktree temporário e instalei as dependências ali com `pnpm install --frozen-lockfile --filter web...` (511 pacotes reutilizados, nenhum download).
2. A porta padrão `5175` estava ocupada e a configuração Playwright impede reutilização em CI. Reexecutei em porta isolada `5176`, usando configuração local temporária não versionada; o teste passou.
3. Não houve falha funcional reproduzida nos testes focados; nenhuma alteração de produto foi necessária.

## Merge e limitações remanescentes

A consulta GitHub desta execução reportou PR aberta, `mergeable: true`, sem conflitos de merge, mas ainda em draft. A branch já incorpora `hmg`; os checks reportados acima passaram. Não fiz merge nem alterei estado da PR.

A correlação individual das oito exceções históricas com eventos PostHog e logs da API/provedor continua sem evidência. Essas fontes não estão disponíveis nesta sessão; não é possível atribuir causa ou ambiente nem declarar que foram esgotadas. O conector ClickUp atingiu o limite diário e o cliente `src/clickup.py` descrito nas instruções não existe neste checkout. O grafo code-review-graph também não está disponível nas ferramentas desta sessão.

Por isso, o E2E e os checks atuais passaram, mas os critérios de investigação histórica e integração real permanecem pendentes; não considero a PR 100% pronta para sair de draft/mergear com base apenas nesta execução.
