# QA — N5 Avaliação do criativo após geração

Data: 2026-11-07
Card: `1dfch0amj6h`
PR: #408 — `[N5] Avaliação do criativo após geração`

## Escopo validado

- convite de avaliação exibido cinco segundos após a geração de um criativo;
- seleção acessível de uma nota de 1 a 5;
- envio para `PUT /studio/assets/:assetId/rating` com o asset e a nota escolhidos;
- manutenção do convite e mensagem de erro quando a API falha;
- novo envio bem-sucedido após uma falha transitória;
- fluxo de progresso e de geração de variações já coberto no mesmo cenário local.

## Problemas encontrados e resolução

1. O Playwright existente chamado `n5-progress.local.spec.ts` não exercia a avaliação; ele cobria apenas progresso e variações. Foi incluído um cenário E2E que cobre exibição, envio, erro e tentativa novamente.
2. A configuração local reutilizava a porta fixa `5174`. Havia outro worktree atendendo essa porta com uma versão anterior, o que produziu um falso negativo (o convite não existia na aplicação servida). `playwright.local.config.ts` agora aceita `PLAYWRIGHT_PORT`, permitindo que cada execução inicie e valide sua própria árvore sem interferir em outro worktree.
3. O input de estrelas é visualmente oculto; o E2E foi ajustado para clicar no `label` visível, que é a interação real do usuário, e ainda confirma que o rádio correspondente fica marcado.

## Evidências

- `PLAYWRIGHT_PORT=5175 pnpm --dir apps/web exec playwright test -c playwright.local.config.ts e2e/n5-progress.local.spec.ts` — 2 aprovados.
- `pnpm --dir apps/api exec vitest run src/__tests__/studio-rating.controller.test.ts src/__tests__/studio-rating.service.test.ts` — 14 aprovados.
- `pnpm --dir apps/web exec vitest run src/pages/estudio/components/CreativeRatingPrompt.test.tsx src/pages/estudio/components/CreativeResult.test.tsx` — 12 aprovados e 1 skip preexistente.
- `pnpm --dir apps/web build` — aprovado.
- GitHub PR #408: `mergeable=true`, `rebaseable=true`, `mergeable_state=clean`; a simulação de merge local com `origin/hmg` também não encontrou conflitos.

## Observações não bloqueantes

- A execução E2E local registra avisos de queries globais não mockadas e do tamanho de bundle; não pertencem ao fluxo N5 e não causaram falha.
