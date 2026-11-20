# QA E2E — card 1dfch0anara — 18/11/2026

Card: [N3] Investigar 502 ao carregar status dos tickets no painel admin. PR verificada: [#487](https://github.com/clickhero-dev/fury-app-v2/pull/487), head anterior `2dc79c485210021b329a68b93aa6ea17e0b48781`, base `hmg`.

## Escopo e resultados

- API: `npx vitest run apps/api/src/__tests__/ticket-status-resilience.bdd.test.ts apps/api/src/__tests__/ticket-status-telemetry.bdd.test.ts apps/api/src/__tests__/ticket-status-exception.bdd.test.ts` — 29/29 testes passaram.
- Web: `pnpm exec vitest run src/pages/superadmin/TicketsPage.test.tsx` — 30/30 passaram.
- E2E Playwright Chromium: `CI=1 pnpm exec playwright test -c playwright.tickets-qa-5199.config.ts e2e-mock/tickets-status-recovery.spec.ts` — 1/1 passou. Valida 502, controles bloqueados, retentativa e recuperação com resposta válida. O serviço API é interceptado; este teste não cobre mutação real nem integração com ClickUp.
- Primeira tentativa do Playwright falhou ao iniciar porque a porta 5175 estava ocupada. A execução foi repetida com configuração temporária na porta 5199 e passou; o arquivo temporário foi removido.
- `git diff --check` passou após resolver o conflito.

## Conflito e falha de CI

A branch estava em conflito com `hmg` em `apps/web/e2e-mock/chat-real.spec.ts`. Resolvi mantendo o seletor acessível com nome exato para o elemento de vídeo, evitando correspondências parciais, e mantendo a expectativa atual da base para aprovação de ação inelegível: HTTP 409. O log do run 44361388931 foi gerado no head anterior e registrou expectativa 404 versus resposta 409. O E2E mockado (96 casos) passou nesse run; a falha era no E2E real, nessa asserção. O merge da base incorpora a expectativa atualizada de `hmg`.

## Limitações e pendências

A validação local não executa o caminho navegador → API → ClickUp real. O run de jornada real anterior só cobriu login e navegação de leitura. A correlação histórica individual das oito exceções permanece pendente: IDs, timestamps intermediários e acesso aos logs históricos de cliente/provedor não foram fornecidos; portanto, não há evidência para atribuir causa ou ambiente nem para afirmar que as fontes foram esgotadas.

Os checks do GitHub precisam concluir no novo head após o envio do merge. A PR deve permanecer em rascunho enquanto qualquer check obrigatório falhar ou enquanto a evidência histórica exigida pelo plano estiver ausente. Nenhum deploy ou merge da PR foi feito.
