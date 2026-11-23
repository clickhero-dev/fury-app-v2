# [N5] Ajustar tela mobile do Assistente Ady e adicionar atalhos de ação direta

## Triagem e decisões
- Base: hmg. Preservar checkout original com mudanças alheias; implementação em worktree isolada.
- Texto confirmado no ChatPage: “Assistente de IA”. Substituir pelo título acessível “Assistente do Ady”.
- PR aberta relacionada: #356, protótipo /conversa sem ferramentas reais, com conflitos. Não importar nem duplicar esse componente; reutilizar /chat funcional já em hmg, perguntas estruturadas e approvals existentes.
- MCP do grafo indisponível. Índice SQLite local consultado; código fonte prevalece sobre índice de outro checkout.
- Rótulos: Criar post para o Instagram; Agendar posts da semana; Criar Reels para o Instagram; Criar vídeo para o negócio; Aumentar seguidores no Instagram; Atrair clientes pelo WhatsApp.

## Specs e sequência de implementação
1. Testar primeiro os seis atalhos: toque abre formulário específico sem chamadas de rede, campo obrigatório, cancelamento sem efeitos e bloqueio durante operações. Executar Red e Green.
2. Cada ação abre sua pergunta inicial no scrollport existente. Continuar envia briefing pelo mesmo submitMessage usado pelo compositor, preservando idempotência, tratamento de erros, recuperação e confirmações. Não preencher o compositor com texto de atalho.
3. Briefings solicitam uma pergunta por vez, dados faltantes, seleção/verificação de contas, permissões, orçamento, revisão e confirmação. Post → ferramentas planner; semana → planner/plans; Reels/vídeo → studio/video; seguidores/WhatsApp → ferramentas de campanhas existentes. Não implementar adaptadores paralelos nem executar/publicar no toque.
4. Manter gates reais no backend para consumo de cota e efeitos externos. A etapa inicial é local e gratuita. Orientação de integração faltante permanece com as ferramentas existentes; mocks não demonstram funcionamento de provedor real.
5. Reproduzir medições em 320x568, 390x844, 844x390 e desktop 1440x900. Usar visualViewport para teclado e safe areas para margens. Conteúdo longo rola dentro do chat; cabeçalho e compositor ficam utilizáveis. Não atribuir causa sem evidência.
6. E2E isolado: validar limites do painel, cabeçalho, todos os seis inícios, ausência de requisições externas no toque, envio específico ao continuar e cancelamento. Simular teclado com visualViewport (não equivalente a aparelho físico). Regressão dos testes de chat existentes.
7. Revisar diff; build/testes relevantes; commit e PR para hmg; acompanhar CI, corrigir falhas do escopo e conferir mergeabilidade/base atualizada. Sem merge/deploy.

## Aceitação
- Sem overflow horizontal da página e painel contido no viewport nos tamanhos testados.
- Título Assistente do Ady visível; seis botões acionáveis iniciam etapas distintas sem preencher o compositor.
- Campo vazio/espaços não permite continuar; cancelar retorna aos atalhos; indisponibilidade mantém saída/recuperação existentes.
- Toque inicial não cria conversa, aprovação, geração ou campanha. Continuar reutiliza chat existente e seus gates, sem autoaprovar.
- Testes unitários e E2E com mocks verdes; regressão desktop coberta; CI verde e PR sem conflitos na base atual.

## Evidências durante implementação
- Red: 7 falhas esperadas no teste de atalhos com os rótulos/fluxos antigos; Green: 8 testes unitários de atalhos.
- Red de viewport: simulação 300x320 com offsetLeft=10/offsetTop=30 recebeu borda direita 382 em tela 390 e 828 em tela 844, limite esperado 310. O hook anterior só acompanhava altura e offsetTop. Correção passa também largura e offsetLeft, inclui safe areas e usa posicionamento até 1023 px.
- Primeira execução E2E paralela de dois comandos compartilhou diretório de artefatos e gerou ENOENT no fechamento; reexecução isolada com diretório próprio. Não foi falha de produto.
- TypeScript e build Vite concluídos; aviso preexistente de bundle >500 kB.
