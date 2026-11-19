# Sugestões contextuais nas ações rápidas — 1dfch0anb15

Ticket: [N3 — Substituir campo extra das ações rápidas por sugestões contextuais](https://app.clickup.com/t/1dfch0anb15).

## Triagem e decisões

Base: hmg (d61e282e). Nenhuma PR aberta específica encontrada; #459 (atalhos mobile) e #454 (perguntas por etapa) já estão integradas. Preservar esses fluxos. O formulário duplicado está em ChatQuickActions; ChatPage mantém o compositor, seleção de conversa, streaming, idempotência e aprovações. Não alterar backend, persistência ou executores. ADR-0001 preservado; ADR-0002 e MCP code-review-graph indisponíveis no checkout/sessão, sem integrações externas novas.

## Especificação

1. Os seis atalhos abrem uma seção com título e uma pergunta, sem textarea, input ou botão Continuar. A abertura não envia mensagens nem cria conversa.
2. Consultar somente GET /auth/me pelo cliente autenticado existente. Aproveitar tenantName, businessContext e audienceDefaults.city; validar tipos e limitar tamanho. Não usar dados de outro tenant, inferir ofertas, inventar público ou executar LLM para sugerir. Falha/ausência de dados usa opções baseadas apenas na ação e indica resposta pelo compositor.
3. Cada ação oferece três intenções pertinentes. Reels: apresentar negócio/atrair clientes, compartilhar dicas/engajar, mostrar bastidores/aproximar público. Personalizar negócio/cidade quando conhecidos. Demais ações: post (apresentação, dicas, produto/serviço), agenda (educativo, apresentação, produtos), vídeo (apresentação, demonstração, bastidores), seguidores (apresentação, educativo, bastidores), WhatsApp (produto/serviço, dúvidas, apresentação). Não tratar intenção como autorização.
4. Botões nativos type=button, grupo nomeado pela pergunta, foco na pergunta ao abrir, foco visível, texto com quebra, alvos de pelo menos 44px. Cancelar retorna aos atalhos sem tocar no rascunho. Instrução orienta resposta livre em Mensagem.
5. ChatPage mantém a ação selecionada. Sugestão passa pela mesma função de envio do compositor, com ação + pergunta + escolha + contexto conhecido + salvaguardas existentes. Usar conversa atual ou criar uma somente se ainda não existir. Resposta livre incorpora o mesmo contexto e envia uma única mensagem. Bloquear reentrada síncrona; limpar seleção e rascunho correspondente somente após aceite do servidor. Falha mantém rascunho e possibilidade de recuperação existente. Navegar para outra conversa não transfere a seleção.
6. Geração com custo, publicação, agendamento e campanha continuam sujeitos à revisão e confirmação explícita. Não chamar endpoints de execução/confirmar a partir de sugestões. O próximo passo é a resposta da Ady pelo streaming existente.

## Implementação e critérios verificáveis

- [x] Red: testes de componente para seis ações sem campo extra, personalização/fallback, cancelamento, teclado, bloqueio e submissão única; testes integrados para compositor, mesma conversa e erro.
- [x] Extrair catálogo e montagem de prompt em módulo puro; manter HTTP num hook e apresentação no componente.
- [x] Integrar seleção no ChatPage e reutilizar submitMessage/streamResponse, preservando texto livre e confirmações.
- [ ] Green: executar Vitest focado e suíte web; build TypeScript/Vite.
- [ ] Atualizar E2E existentes e adicionar mobile para contexto, toque/teclado, resposta livre, falha e ausência de overflow. APIs simuladas, nenhuma geração paga. Validar 320x568, 390x844, 844x390 e desktop.
- [ ] Revisar diff, atualizar branch com hmg, abrir PR com título exato do ticket e acompanhar checks. Não merge/deploy.

Aceite: um único textbox (Mensagem), opções claras e contextualizadas, envio único para a mesma conversa, resposta da Ady visível, rascunho/contexto preservados ao falhar, zero chamadas de execução externa e CI aprovado, PR atualizada/sem conflitos.

## Evidências de validação

- Red confirmado no componente original (9 falhas), na integração do compositor (2 falhas), no reenvio de briefing e na apresentação compacta; Green posterior: 54 testes focados passaram, incluindo os 29 de concorrência.
- Build TypeScript/Vite passou. Verificação visual em Chromium com APIs simuladas nas larguras 320, 390 e 844; compositor permanece acessível e opções têm alvos de 44px.
- Primeira execução Playwright: 39 de 40 passaram; um seletor do novo teste de navegação usava um nome incorreto para o diálogo. Corrigido para o diálogo existente, sem mudar produção; suíte de sugestões reexecutada no checkout final.
- PR #465 direcionada a hmg. Resultado final das suítes/CI registrado na descrição da PR.
