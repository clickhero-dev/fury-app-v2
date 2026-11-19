# QA E2E — [N5] Ady mobile e atalhos — 18/11/2026

Card: [1dfch0anaq1](https://app.clickup.com/t/1dfch0anaq1)  
PR: [#491](https://github.com/clickhero-dev/fury-app-v2/pull/491)  
Head testado: `4cf44769748dcb2a1600458a1d5e7ddaebcf074d`

## Escopo e resultados

- E2E Playwright `chat-ady-actions.spec.ts`: **6/6 aprovados**.
- Teste unitário `ChatQuickActions.test.tsx`: **19/19 aprovados**.
- Layout e fluxos conferidos em 320×568, 390×844, 844×390 e 1440×900.
- Foram exercitados os seis atalhos específicos, cancelamento sem requisição, continuação bloqueada sem resposta e envio do briefing somente após preenchimento.
- Os três atalhos gerais existentes continuam enviando o pedido escolhido sem autorizar publicação, agendamento ou mídia paga.
- A simulação de `visualViewport` confirmou o painel e o campo de mensagem dentro da área visível com teclado em retrato e paisagem.
- GitHub no head testado: PR aberta, base `hmg`, mergeável e sem conflitos. Checks `build-web`, `build-api`, `test-unit`, `Chatbot / real DB, E2E and image` e `jornada-real` passaram; `pause-qa-campaign` foi ignorado conforme o workflow.

## Ocorrências e resolução

1. A porta padrão 5175 já estava ocupada por outro processo. A execução inicial parou antes dos testes. Reexecutei isoladamente na porta 5176, sem encerrar ou alterar o processo existente.
2. Durante os testes, o console registrou avisos de dados indefinidos para queries de assinatura, notificações, anúncios e conexões Meta. O servidor mock deste E2E responde apenas às rotas do chat; os avisos não causaram falhas e não pertencem às funcionalidades exercitadas por este card.
3. A leitura do card no ClickUp não foi possível porque a integração atingiu o limite diário de chamadas. A descrição do PR #491 foi usada como contexto. Nenhuma alteração no ClickUp foi feita.

## Limites

As integrações externas e o teclado foram simulados no navegador; não foi usado aparelho físico. Os checks remotos listados acima correspondem ao head identificado no início deste relatório; o CI será renovado após a inclusão deste documento.
