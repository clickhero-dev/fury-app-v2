# [N5] Corrigir rolagem e alinhamento dos controles no chat mobile

## Diagnóstico e escopo
Base: hmg. PR aberta #356 adiciona um protótipo separado em /conversa e não corrige o chat real /chat. Não incorporar esse protótipo. Ferramentas MCP do grafo indisponíveis; implementação e testes inspecionados diretamente. Mudanças locais preexistentes preservadas em outro checkout.

O chat já acompanha mensagens somente quando a distância ao fim é inferior a 80px e oferece “Mensagens recentes”. Sua altura usa 100dvh, sem reagir ao VisualViewport do teclado. Teste em Chromium com viewport visual 480px e layout 844px deixa o compositor em y=835px. Controles usam coluna somente entre md e 1439px, deixando mobile horizontal. Não foi reproduzido salto no envio simples com teclado fechado; não atribuir toda a queixa a esse caminho.

## Especificação
- Até 700px, conter o chat na área visível com VisualViewport.height/offsetTop, fallback 100dvh. Ignorar zoom (scale diferente de 1). Remover listeners no unmount. Preservar áreas seguras e tamanho mínimo do campo.
- Manter um único scroll interno de mensagens. Mudanças de altura do compositor/viewport acompanham o fim apenas se followLatest já estiver ativo. Sem scrollIntoView ou foco automático ao enviar. Leitura anterior mantém scrollTop, com retorno explícito às recentes. Considerar mídia que termina de carregar.
- No chat mobile, controles globais em coluna: tema acima do sino, gap 8px, alvos >=44px. Reservar altura/largura no cabeçalho para não cobrir texto ou ações. Popover abaixo dos controles, dentro da tela. Desktop preservado.
- Não alterar API, persistência, conteúdo de mensagens ou regras de notificações. ADR-0001 sem impacto nas camadas; ADR-0002 não aplicável (nenhuma integração nova).

## Passos
1. Escrever regressões Gherkin pt-BR com Playwright e testes de hook com Vitest; registrar falhas antes da produção.
2. Extrair adaptação do viewport em hook de apresentação, integrar ao container existente.
3. Observar mudanças de dimensão da área de mensagens mantendo a intenção de seguir o fim; manter a regra de 80px e botão existentes.
4. Aplicar coluna no mobile somente no chat e reservar espaço no cabeçalho; manter breakpoints existentes nas demais telas.
5. Rodar suíte do chat/shell, build e E2E (375, 390, desktop 1280/1440; histórico longo, envio pendente, resposta, teclado simulado). Inspecionar screenshots.
6. Revisar diff, atualizar com origin/hmg, abrir PR para hmg e acompanhar CI até sucesso. Sem merge/deploy.

## Aceitação verificável
- Envio e resposta no fim deixam mensagem/estado relevantes visíveis e não alteram window.scrollY.
- Leitura antiga mantém posição ao receber resposta e abrir/fechar teclado; botão recentes volta ao fim.
- Com viewport visual reduzido a 480px, compositor termina antes de 480px; fechar teclado restaura altura. Navegador sem VisualViewport usa CSS e zoom não redimensiona indevidamente.
- Controles mobile têm mesmo eixo x, separação >=8px, tamanho >=44px e cabem no cabeçalho, com badge legível e popover visível.
- Sem rolagem horizontal em 375px; histórico e compositor acessíveis; desktop continua passando testes.

Limite: emulação geométrica do teclado cobre contrato de VisualViewport, não substitui execução em teclado físico iOS/Android.
