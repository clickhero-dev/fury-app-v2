# [N3] Investigar 502 ao carregar status dos tickets no painel admin

Relacionado: [Mudar status dos tickets pelo painel de admin](https://app.clickup.com/t/1dfch0amm3u).

## Evidências e limites da investigação

Relato: 8 exceções backend `TICKET_PROVIDER_UNAVAILABLE` em GET
`/api/admin/tickets/statuses`, de 2026-11-11 13:03:26Z a 2026-11-16 17:02:22Z.
Sem ambiente nos eventos e sem ocorrências nas 24h anteriores à consulta relatada.
Não atribuir essas ocorrências a HMG/produção nem assumir causa remota.

Inspeção de origin/hmg: listStatuses já usa GET /list/:id, corrigindo a rota
/list/:id/status da implementação inicial. A consulta não tinha retry; o serviço
reduzia falhas ao mesmo 502. Lista vazia era aceita e itens null geravam TypeError.
Não há PR aberta relacionada na consulta inicial. PR funcional anterior #392 já
foi incorporada à base. O ticket ClickUp registra reprovação do seletor em HMG;
isso não demonstra o ambiente dos oito eventos.

Grafo MCP, PostHog e logs históricos do cliente/provedor não estão disponíveis
nesta sessão. A causa das oito ocorrências permanece não confirmada. Para fechar
esse critério, consultar as exceções originais e logs de requisição/provedor no
intervalo UTC, comparando timestamp, rota, release, requestId e status externo.
Classificar individualmente timeout, 429, 401/403, rede, 5xx ou resposta inválida.
A nova instrumentação permite correlação futura; não reconstrói dados históricos.

ADR-0001 lido: manter controller/service/adapter com DI, sem persistência nova.
ADR-0002 ausente na base; aplicar externalFetch, timeout e erros sanitizados.

## Especificação e aceitação

1. Fonte única: GET /list/:id do ClickUp, com configuração existente. Retornar os
   status reais normalizados; recusar JSON inválido, lista vazia, item nulo,
   nome vazio e tipo vazio. Não usar cache nem opções derivadas dos tickets.
2. Somente consulta de status recebe retry: no máximo duas chamadas externas;
   timeout de 3s por tentativa (inclui leitura do corpo no fetch nativo), orçamento
   total de 7s. Rede, timeout, 429 e 5xx podem repetir; 401/403/404 e resposta
   inválida não. Não repetir PUT/POST.
3. Respeitar Retry-After em segundos ou data HTTP, inclusive em 5xx. Sem valor
   válido, aguardar 250ms. Se espera + uma tentativa não couber no orçamento,
   retornar erro imediatamente, sem antecipar Retry-After.
4. Falha final continua HTTP 502 TICKET_PROVIDER_UNAVAILABLE e mensagem segura.
   Diagnóstico interno: razão em enum, status externo quando disponível, ambiente
   APP_ENV (ou NODE_ENV, ou unknown) e requestId do request logger, com UUID quando
   ausente. Não inferir produção de NODE_ENV=production; configurar APP_ENV com
   o ambiente de implantação. Nenhum token, body ou erro bruto do provedor.
5. Evento ticket_clickup_statuses_failed e exceção backend compartilham diagnóstico.
   Apenas requestId vai em details públicos; status externo/razão ficam internos.
6. Painel mantém listagem em falha dos status. Diálogo informa indisponibilidade,
   bloqueia confirmação sem opções e permite tentar novamente, com estado de carga.
   Não inventar nem apresentar cache como atual. Retry manual usa recarga existente.

## Passos de implementação e validação

- [x] Verificar PRs abertas e criar worktree isolado a partir de origin/hmg.
- [x] Ler adapter, service, controller, wrapper HTTP e testes relacionados.
- [x] RED: adicionar cenários BDD pt-BR com mocks de sucesso/falha e rodar Vitest.
- [x] GREEN: implementar retry de leitura, validação e diagnóstico seguro.
- [x] RED/GREEN: cobrir recuperação do diálogo e acrescentar ação acessível.
- [x] Verificar testes focados, lint, build e fluxo no navegador mockado.
- [x] Revisar diff e abrir PR #463 para hmg. Acompanhar CI até concluir.
- [ ] Correlacionar as oito exceções históricas (bloqueio: fontes não disponíveis).

## Evidências de validação

- RED: 13 cenários do cliente falharam antes da correção; 5 cenários de telemetria
  falharam por ausência de correlação; regressão da UI falhou por ausência do alerta.
- GREEN: suíte focada API, suíte da página (30/30), lint API/web (sem erros; warning
  preexistente do React Hook Form) e build web.
- Build API passou após instalação isolada com lockfile e rebuild shared/db. A
  primeira execução usava artefatos compartilhados incompatíveis de outro checkout.
- Playwright Chromium: recuperação 502 → nova consulta → seletor habilitado passou,
  sem pageerror nem mutação real. Vite serviu este worktree na porta isolada 5188;
  porta padrão estava ocupada. Screenshot local /tmp/tickets-status-recovery.png.
- Testes adicionais: Retry-After data HTTP, inválido/passado, JSON malformado,
  limite real de timeout persistente e correlação controller → serviço → exceção.
- PR: https://github.com/clickhero-dev/fury-app-v2/pull/463. Base origin/hmg ecd4206c
  incorporada. Sem merge nem deploy. Correlação histórica continua pendente.
