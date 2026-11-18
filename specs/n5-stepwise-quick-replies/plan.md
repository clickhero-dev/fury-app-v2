# N5 — coleta de um dado por vez com respostas rápidas

## Triagem e decisões

Base: hmg 25abc324. Nenhuma PR aberta corresponde a esta coleta. PR #356 é um protótipo mobile sem agente e não contém a correção. A base já possui ADY_MESSAGES/clarify, seleção imediata por índice, persistência em chat_clarifications, histórico com pergunta/opções, clientKey idempotente, fences de concorrência e recuperação via GET/retry. Não criar outro wizard ou tabela. A captura não foi reproduzida com provedor real; a instrução atual permite esclarecimento mas não exige coleta sequencial. Grafo MCP indisponível nesta sessão. ADR-0001 consultado; ADR-0002 não existe nesta base. Não alterar integrações externas.

## Contrato e implementação

1. Política do agente: coletar somente o próximo dado necessário; considerar histórico e contexto confiável; nunca listar perguntas futuras. Planejamento sem dados começa pelo período, depois objetivo, formato e frequência, omitindo os já conhecidos. Não tornar esses quatro campos obrigatórios para outros pedidos.
2. Usar o envelope existente com uma pergunta em clarify.question, 2–5 opções contextuais distintas incluindo alternativa livre quando pertinente. messages contém apenas contexto declarativo breve; a pergunta aparece somente em clarify. Sem alternativas previsíveis, perguntar em texto comum sem botões artificiais. Outro período/Outra opção é uma resposta imediata: pedir o valor livre do mesmo dado, sem avançar até recebê-lo. Não preencher o composer.
3. Validar o envelope antes de persistir: rejeitar múltiplas interrogações na pergunta ou perguntas adicionais nas mensagens. Aceitar repetição exata da pergunta por compatibilidade; UI evita repeti-la no mesmo balão. Não truncar a resposta nem inferir campos a partir de pontuação. Este guard é estrutural, não substitui entendimento semântico do modelo.
4. 'Pode decidir por mim': usar somente contexto autorizado/confiável, explicitar sugestões e lacunas, apresentar resumo e preservar gates antes de custo/efeitos. Não executar novas ações automaticamente.
5. Reutilizar transação de seleção, histórico, idempotência, isolamento por tenant e tratamento de timeout existentes. Texto livre continua pela rota messages e encerra opções obsoletas. Recarregar restaura respostas do servidor. Não alterar confirmação ou execução.
6. Botões com alvo mínimo 44px, quebra de texto, foco visível e largura contida.

## TDD e aceitação

- RED: testes do contrato recusam perguntas acumuladas; teste de instruções do agente verifica política no ponto de execução; E2E exige alvo de toque de 44px e pergunta não duplicada.
- GREEN: implementar política, validação e pequenos ajustes de renderização/CSS; rodar pytest e vitest relevantes.
- E2E com backend mockado e viewport 390x844 e desktop: iniciar planejamento, verificar apenas período; clicar respostas enviando imediatamente e avançar em ordem; Outro pede texto livre; reload preserva estado; erro recuperável não duplica escolha; delegação mostra resumo e confirmação sem executar ações. Verificar conteúdo, teclado, dimensões e overflow.
- Rodar regressões de esclarecimentos, streaming, confirmações e build/checks aplicáveis; revisar diff; abrir PR para hmg com título solicitado. Acompanhar CI e checar mergeability/base atualizada. Não fazer merge/deploy.

## Limites de validação

Mocks comprovam o contrato e a interação, não a aderência semântica de um provedor probabilístico real. Relatar separadamente qualquer teste indisponível ou bloqueio de CI.

## Evidências de execução

- RED confirmado: parser aceitava múltiplas perguntas; política não chegava ao agente; E2E mostrava pergunta duplicada (mobile e desktop).
- GREEN inicial: 37 testes Python de contrato/instruções/streaming e 22 testes vitest de esclarecimentos/mensagens/aprovações; E2E sequencial passou em 390 e 1280 px.
- Alvos de toque já medem pelo menos 44px no CSS herdado: não foi necessário mudar CSS.
- Recuperação respeita o mecanismo existente: após resposta 503 de aceitação incerta, reload oferece Reenviar envio pendente com o mesmo clientKey, sem desbloquear uma segunda seleção concorrente.
- Primeira execução ampliada sem serviços: 665 passed, 99 skipped, 4 failed e 8 errors por ausência de banco isolado e MODEL_CHATBOT. Gate com serviços descartáveis será registrado na PR junto ao CI.
