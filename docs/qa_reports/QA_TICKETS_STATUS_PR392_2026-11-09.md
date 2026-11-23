# QA — PR #392: status de tickets pelo painel

## Escopo

Validação do card `[N5] Mudar status dos tickets pelo painel` (`1dfch0amm3u`), incluindo a atualização de status no ClickUp, o painel administrativo e a recuperação de conflito de concorrência.

## Problemas encontrados e resolução

1. O E2E de filtros de tickets não simulava as novas chamadas para `GET /admin/tickets/statuses` e para `GET /rbac/blocked-views`. A implementação fazia essas chamadas corretamente; o mock e a lista de rotas aceitas estavam desatualizados. O mock foi completado e a asserção passou a validar o contrato atual.
2. O workflow remoto `jornada-real` estava falhando por aguardar os `data-testid` dos cards de destino, que não existem na interface implantada em homologação. O teste já obtém os checkboxes pelos papéis e nomes acessíveis; os cliques passaram a reutilizar esses locators, removendo a dependência incompatível.
3. Não havia E2E de navegador para a alteração genérica de status. Foi adicionado cenário que valida `PATCH /admin/tickets/:id/status`, a atualização visual e o caminho de conflito HTTP 409 com recarregamento da lista.

## Evidências

- `pnpm --dir apps/web exec playwright test -c playwright.tickets.config.ts`: 3 cenários aprovados.
- `pnpm exec vitest run apps/api/src/__tests__/tickets.controller.test.ts apps/api/src/__tests__/tickets-status.service.test.ts apps/api/src/__tests__/clickup-tickets-client.test.ts`: 43 testes aprovados.
- A árvore de merge de `origin/hmg` com a branch da PR foi calculada sem conflitos.

## Limite da validação remota

A jornada real depende de credenciais e de uma conta já implantada em homologação; portanto, a correção do seletor será confirmada pelo novo workflow do GitHub após o push. O erro anterior foi reproduzido e tem causa determinada no log do job `jornada-real`.
