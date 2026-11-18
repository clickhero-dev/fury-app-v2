# [N5] Criar Home inicial com cards de ações simples para todos os usuários

Ticket: https://app.clickup.com/t/1dfch0anb3a
Base investigada: origin/hmg 58f11031 (17/11/2026).
A instrução de execução desta sessão autoriza implementação e PR após esta SPEC; não autoriza merge/deploy.

## Decisões e contratos

1. Reutilizar `/inicio` como Home dentro de `AuthenticatedShell`; remover a consulta/decisão exclusiva Trial → chat. Login normal, social, cadastro, acesso Trial e demo usam a mesma entrada. Superadmin continua em `/admin/dashboard`.
2. O destino explicitamente pedido tem precedência. Guardar pathname + query + hash de rotas protegidas na aba ao exigir login; consumir após autenticação, inclusive retorno OAuth. Aceitar somente rotas internas conhecidas; rejeitar URLs externas, barras invertidas e entradas de login que causariam loops. O shell/servidor revalida autorização no destino.
3. Preservar gates atuais. Na hmg investigada, política, senha Trial e redirect obrigatório Meta estão temporariamente desativados: esta tarefa não os reativa nem cria isenções para gates futuros. Home fica sob o mesmo shell. Expiração confirmada e último vencimento persistido continuam bloqueando. Ausência/falha de plano sem evidência de vencimento permite a Home (os fluxos mantêm os gates e validações existentes).
4. Sidebar: `Início` → `/inicio`, `Painel` → `/dashboard`. Métricas, dados demo, OAuth Meta e rotas de ferramentas permanecem como estão.
5. Layout: título “O que vamos fazer hoje?”, frase curta de orientação, quatro links em grade de duas colunas no desktop e uma no mobile, ícones decorativos, foco visível, benefício textual e CTA. Sem métricas e sem dependência de consulta de plano para renderizar os cards.
   Os atalhos flutuantes ficam ocultos somente na Home para não cobrir os cards nem disputar atenção com os quatro caminhos. Continuam nas demais telas conforme as regras existentes.

| Ordem / id | Card | Benefício | Primeira pergunta da Ady |
| --- | --- | --- | --- |
| 1 / orientacao | Não sei por onde começar | Encontre um próximo passo simples para seu negócio. | O que você mais precisa para seu negócio agora? |
| 2 / conteudo | Criar conteúdo para minhas redes | Transforme uma ideia em post, imagem ou vídeo com ajuda da Ady. | O que você quer criar para suas redes? |
| 3 / semana | Planejar minha semana | Organize ideias de publicações e prepare sua semana. | Qual é o foco das publicações desta semana? |
| 4 / clientes | Atrair mais clientes | Prepare uma campanha guiada para divulgar seu negócio. | O que você quer divulgar para atrair clientes? |

6. Cada link abre `/chat?inicio=<id>` com a pergunta e três sugestões pertinentes já abertas, mais o compositor existente para resposta livre. É um fluxo guiado ativo, sem texto apenas preenchido e sem envio automático. Não reabrir a última conversa ao iniciar pela Home; preservar histórico e retomada no acesso comum ao chat. IDs desconhecidos caem no chat comum.
7. Reutilizar `ChatQuickActions`, `buildQuickActionPrompt`, `/auth/me`, streaming, clarificações e ferramentas existentes. Consultar contexto opcional somente ao abrir fluxo; usar apenas negócio/cidade/contexto normalizados de `/auth/me`. Contas, marca, histórico e objetivos adicionais são consultados pelas ferramentas existentes quando necessários; não inventar nem pré-carregar dados de terceiros.
8. Sugestões cobrem falta de ideia, escolha de post/imagem/vídeo, planejamento sem posts prontos e primeira campanha. Texto orienta ausência de contexto e integração; bloqueios nunca escondem os quatro cards. Backend mantém elegibilidade/permissões. Prompt exige linguagem simples, uma pergunta por vez, opções quando previsíveis e benefício explicado. Campanha não presume WhatsApp, orçamento ou integração.
9. Nenhum clique na Home cria conteúdo, agenda, publica ou compra. A resposta inicia conversa; as ações propostas continuam exigindo revisão/confirmação e validação do servidor. Não alterar provedores, persistência ou regras de execução (ADR-0001; ADR-0002 não é acionado).
10. Sucesso: início real = primeira resposta do fluxo aceita pelo chat; avanço = resposta da Ady recebida sem erro. Emitir eventos PostHog `home_fluxo_iniciado` e `home_fluxo_avancou` somente com id enumerado. Taxa de avanço/início é métrica inicial; conclusão de publicação/campanha deve ser apurada pelo resultado persistido das ferramentas existentes, nunca inferida de clique, proposta ou job iniciado. Não incluir briefing, nome, mensagens ou IDs pessoais nos novos eventos.

## BDD / critérios de aceite verificáveis

- Dado Trial, pago, demo, plano ausente, inválido ou falha de consulta sem vencimento conhecido, quando entra pelo caminho padrão, então vê Home sem decisão por plano.
- Dado visitante, quando abre Home/rota protegida, então deve autenticar. Dado vencimento confirmado, então o shell preserva bloqueio. Gates de política/onboarding seguem a configuração existente e não são ignorados por uma rota fora do shell.
- Dado deep link interno com query/hash, quando autentica, então retorna a ele; destino externo/inválido é descartado. Dado superadmin, então o padrão é sua área administrativa.
- Dado desktop ou mobile, então os mesmos quatro cards são links nomeados, têm benefício, foco e área de toque; Home e Painel são navegáveis.
- Dado cada card, quando o abre, então vê uma pergunta específica e sugestões; quando responde, então uma conversa nova recebe a intenção/contexto e a Ady continua, sem executar ação real.
- Dado contexto ausente ou falha no contexto, então sugestões genéricas continuam úteis e nenhum negócio/integração é inventado. Dado falha ao iniciar conversa, então mantém a seleção/resposta e permite tentar novamente.
- Dado chat anterior salvo, quando inicia card da Home, então preserva histórico sem anexar briefing à conversa antiga. Acesso comum mantém retomada.
- Dado resposta aceita/recebida, então telemetria registra apenas id do fluxo; falha de criação/envio não conta avanço.

## Plano de implementação e validação (Red → Green → Refactor)

1. Escrever testes de destino e retorno seguro, Home acessível, quatro intenções/contexto e entrada do chat; executar e registrar Red antes de produção.
2. Substituir seletor Trial por Home no shell; adicionar destino seguro compartilhado para login normal/social/demo e proteger deep links. Cobrir ausência de plano sem remover bloqueio de expiração.
3. Implementar cards e navegação reutilizando AppLayout/tema. Ampliar catálogo do chat com as quatro intenções; iniciar seleção por id validado e evitar restauração de conversa anterior nessa entrada.
4. Validar Green com Vitest, suíte web e build TypeScript/Vite; revisar diff e cobertura de falhas.
5. Adicionar E2E isolado Playwright com API simulada e rede externa bloqueada: login padrão, Trial, demo, erro/ausência de plano, deep link, visitante, vencimento, superadmin, navegação Painel e resposta de cada card, em desktop/mobile. Sem contas reais nem execução paga. Integrar esse gate ao CI.
6. Revisar diff completo e evidências; commit/push somente desta worktree. Abrir PR para hmg com título do ticket; acompanhar todos os checks, corrigir falhas e atualizar a base sem force push. Confirmar base ancestral e mergeable antes de encerrar.

## Progresso

- [x] Busca de PRs por Home e id do ticket: nenhuma PR relacionada encontrada.
- [x] Inspeção dos fluxos e SPEC antes de alterações de produção.
- [x] Red na base: 32 cenários falharam pelos contratos novos de Home/entrada, e 8 cenários existentes passaram. Red adicional reproduziu consumo duplo de deep link em StrictMode, perda de retorno ao onboarding, erro SSE contado como avanço e sobreposição dos atalhos.
- [x] Implementação e Green focado: 60 testes de destino, shell, entrada do chat, navegação e falhas; mais 10 testes de atalhos. Build TypeScript/Vite aprovado.
- [x] Revisão visual inicial desktop/mobile; correção da sobreposição observada e confirmação de legibilidade/ordem/benefícios.
- Validação final de navegador, suíte ampla, revisão da PR e estado do CI: registrar resultados e links na descrição da PR. E2E usa API simulada e bloqueia rede externa; não valida respostas de provedores LLM nem executa ações reais.
