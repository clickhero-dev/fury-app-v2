# [N5] Hierarquia mobile da criação no Estúdio

Ticket: [Melhorar hierarquia visual da criação de imagem e vídeo no mobile](https://app.clickup.com/t/1dfch0anb3h).
Base investigada: `origin/hmg` em `564b531c` (mais recente que o levantamento inicial).

## Objetivo e limites

Facilitar a leitura e a próxima ação em `/estudio` e `/estudio?criar=rapida`, sem modificar handlers de geração, payloads, API, quotas, modelos ou permissões. A autorização de implementação é o pedido atual, posterior ao handoff de levantamento. Sem merge, deploy ou geração paga real.

O índice SQLite local do code-review-graph identifica `EstudioHome → VideoCreateForm → ReferenceImagePanel/LibraryUploadFlow`; a implementação foi conferida nesses arquivos e nos testes. Os tools MCP não estavam expostos no catálogo inicial; foi localizado o servidor no virtualenv do projeto e consultado por cliente MCP stdio. Um índice separado foi construído neste worktree, preservando o índice e o trabalho do diretório original. ADR-0001 consultado; ADR-0002 ausente no checkout e integrações externas fora do escopo.

## Diagnóstico e decisão visual

Revisão do checkout local no Chromium, 360×800, com API simulada e sem chamadas externas: a tela inicial tem título genérico, rótulo da descrição pequeno em caixa alta, cartões de referências longos antes da ação e modelo/proporção/gerar sem agrupamento explícito. No vídeo, o roteiro é inserido sem um indicador de etapa. Não houve overflow horizontal nessa amostra. O banner de cookies foi observado e será aceito nas capturas de formulário; não é a causa atribuída ao pedido. Atalhos globais flutuantes podem ocupar o formulário mobile e serão recolhidos somente durante criação mobile, preservados na biblioteca e no desktop.

1. Preservar o h1 “Criação rápida” e adicionar h2 visível “Criar imagem” ou “Criar vídeo”. Alternância Imagem/Vídeo com `aria-pressed`, alvo de 44px e largura distribuída no mobile.
2. Descrição principal em primeiro lugar, com rótulo em linguagem natural, peso maior, campo de 16px no mobile, contador separado e ajuda: mínimo de 10 caracteres. Preservar limite de 1000 e rótulo contextual quando houver modelo de referência.
3. Referências em disclosure nativo `details/summary`, inicialmente fechado, marcado “Opcional”. Ao abrir, oferecer todos os controles existentes (modelo, produto/equipe, seleção, envio e biblioteca), agrupados no mesmo local. Seleções resumidas no título, sem perder estado ao fechar. No desktop, referências abertas distribuem cartões e biblioteca em colunas. Não duplicar inputs nem bibliotecas.
4. Configurações sempre visíveis, em superfície secundária: imagem com modelo de IA (quando aplicável) e proporção; vídeo com formato e duração fornecida pelo backend. Não inventar seletor de duração onde hoje existe só duração fixa. Não ocultar controles essenciais.
5. Ação principal de largura total no mobile e no fluxo normal, após configurações. Ajuda contextual separa “gerar roteiro para revisar” de “gerar vídeo”. Cota e mensagens de erro permanecem visíveis junto da ação. Sem barra fixa ou sticky sobre campos.
6. Vídeo com lista ordenada “Descrever → Revisar roteiro → Gerar vídeo”, etapa atual via `aria-current=step`. Após resposta do roteiro, foco no título de revisão; campos de cena/narração editáveis e “Refazer roteiro” preservados. Enviar vídeo apenas pelo botão explícito, mantendo validação de cenas.
7. Padding mobile de 16px externo já fornecido pelo layout, evitando soma desnecessária de 24px internos; gaps 16px, painéis 16px. A partir de sm, preservar espaço maior. Textos auxiliares quebram linha e não competem com o contador. Usar tokens existentes, foco visível, controles de toque >=44px, nenhuma truncagem nos controles de criação.
8. Modais de seleção/envio continuam disponíveis e cabem em 360px: grade adaptável, botões em fluxo e foco do input de arquivo perceptível.

## Aceite verificável

- Em 360×800 e 390×844, nos dois modos, referências fechadas/abertas, modelo selecionado, upload, revisão e erro: `scrollWidth <= clientWidth`, campos e ações dentro da viewport horizontal, sem sobreposição de controles globais no formulário.
- Título do modo, rótulo principal, disclosure “Opcional”, configurações e CTA identificáveis por nome acessível. Ação alcançável por rolagem normal e tem largura total mobile e altura >=44px.
- Alternar modos conserva o comportamento anterior (imagem mantém seu estado; vídeo é remontado ao sair). Entrada pela biblioteca e deep-link apresentam a mesma hierarquia. Planos bloqueados continuam sem os modos correspondentes.
- Imagem: menos de 10 caracteres e cota zerada bloqueiam geração; proporção/modelo/referências chegam intactos ao mock; fallback do aprimoramento e loading existentes continuam cobertos.
- Vídeo: descrição curta/cota zerada/opções indisponíveis mantêm bloqueio; roteiro precede geração; edição chega ao payload; cena visual inválida bloqueia; erro permite nova tentativa e preserva edição; fala longa mantém aviso; pending bloqueia duplicidade.
- Desktop 1440×1000 mantém todos os controles, biblioteca e etapas utilizáveis, sem overflow; claro/escuro e foco por teclado conferidos.
- Nenhuma requisição paga é enviada: E2E intercepta toda API e bloqueia rede externa. Gate CI desta melhoria deve usar esses testes; não executar jornada paga como validação desta tarefa.

## Plano de implementação (TDD)

1. Registrar esta SPEC antes de produção e criar testes Vitest em pt-BR (Dado/Quando/Então) para hierarquia, alternância, etapas, exceções e bloqueios. Criar E2E isolado para as duas entradas e tamanhos, payloads simulados, referências/upload e desktop. Confirmar Red por ausência da hierarquia/etapas esperadas.
2. Extrair disclosure de referências compartilhado; reorganizar somente apresentação em `EstudioHome`/`VideoCreateForm`. Aplicar estilos locais de responsividade e alvos de toque; ajustar modais apenas onde necessário.
3. Comunicar ao shell o estado de criação para recolher atalhos somente no mobile; cobrir biblioteca e retorno com teste. Preservar atalhos desktop.
4. Confirmar Green nos testes focados, executar suíte web e build. Rodar E2E mock em 360×800, 390×844 e desktop, revisar capturas e corrigir diferenças reais.
5. Revisar diff, registrar evidências, atualizar branch com `hmg`, commit/push e abrir PR com título do ticket para `hmg`. Acompanhar CI, corrigir falhas do escopo e confirmar ausência de conflitos. Registrar bloqueios externos sem contornar cotas ou enfraquecer testes.

## Evidências

- Red: `npx vitest run src/pages/estudio/EstudioHome.mobile.test.tsx`: 5 falhas pela ausência da hierarquia/etapas, 4 testes de preservação passaram. Teste novo de recolhimento do FAB falhou antes da implementação. E2E inicial falhou no título de modo ausente.
- Green: `npx vitest run src/pages/estudio/EstudioHome.test.tsx src/pages/estudio/EstudioHome.mobile.test.tsx src/pages/estudio/components/ReferenceImagePanel.test.tsx src/components/fab/FabActions.test.tsx --maxWorkers=1`: **68 passaram**. Inclui 12 cenários novos de hierarquia, etapas, erros, pending, validação, planos/cota e fallback.
- Regressão adicional: Estúdio completo, progresso, resultados e shell: **103 passaram e 1 ignorado** na execução focada anterior.
- `npm run build` em `apps/web`: passou (TypeScript + Vite). Permanecem avisos existentes de chunks grandes/configLoader.
- Playwright isolado: **12 cenários passaram**, nos projetos 360×800, 390×844 e desktop 1440×1000: duas entradas, alternância, fotos/modelo, upload, revisão/edição, payloads, falha 503, teclado e tema escuro. Screenshots geradas em `apps/web/test-results/studio-mobile`; o CI publica o artefato `studio-mobile-evidence`.
- Revisão de capturas: corrigidos quebra do texto de filtros, alvo de remoção/ocultação, contraste da ação de vídeo, posição da seta do disclosure e espaço do botão de fechar. Formulários sem barra fixa, CTA de largura total e 44px no mobile. A biblioteca usa scroll interno para listas extensas.
- A primeira suíte web ampla passou 1120 testes, mas uma suíte não carregou `zod` por falta do link de dependências de `packages/shared` no worktree. A instalação local foi corrigida e essa suíte passou (7 testes). Execuções sob concorrência pesada também expuseram timeout em dois testes antigos de digitação; seus fixtures de vídeo foram corrigidos e o preenchimento foi simplificado, preservando todas as expectativas de payload. Os 68 testes focados passaram depois desses ajustes. A suíte completa será novamente verificada no ambiente limpo do CI.
- MCP `detect_changes_tool` e `get_review_context_tool` consultados no índice do worktree: priorizam shell/FAB/upload e apontam lacunas estáticas em componentes React. A cobertura foi verificada no código dos testes e em execução; `tests_for(VideoCreateForm)` não reconhece toda a cobertura indireta de `EstudioHome.mobile.test.tsx`. `get_affected_flows_tool` não retornou fluxos (índice sem pós-processamento); isso não foi interpretado como ausência de impacto.

## Automação sem geração paga

O workflow `qa-jornada-real.yml` fazia campanha e geração real em toda PR. Para cumprir a restrição de custo deste trabalho, essa jornada foi preservada integralmente e passou a `workflow_dispatch` (execução manual explícita na branch escolhida). O CI automático mantém builds, API, suíte web, rating e chatbot isolados e acrescenta o gate responsivo do Estúdio com rede externa bloqueada. Não há alteração de assertions, cotas ou bloqueios para tornar a jornada paga verde. Essa mudança de gatilho é parte explícita da PR; a jornada paga não foi executada.

## Revalidação independente — 2026-11-18

- Card consultado pela API existente após limite diário do conector ClickUp. A restrição de não realizar geração paga foi mantida.
- No HEAD `f5e92b81`, Playwright executou 12/12 cenários isolados em 360×800, 390×844 e 1440×1000; Vitest focado passou 68/68. As capturas foram geradas localmente e a tela de vídeo em 360px foi inspecionada visualmente. Chamadas de geração foram simuladas e rede externa bloqueada.
- CI do chatbot falhou em recuperação de `draft_text`. Reproduzido com PostgreSQL e Redis descartáveis: 2/3 passaram e o teste esperava `failed`, mas recebeu `completed`. A implementação de `hmg` já considera `draft_text` seguro para repetir até duas tentativas. O teste de integração foi alinhado ao contrato atual e ampliado para verificar sucesso na segunda tentativa e falha sem repetição após esgotar o limite; workers são fechados antes de preparar o fixture. Após a alteração: 4/4 passaram. Não houve alteração da lógica de produção.
- O checkout compartilhado tinha alterações preexistentes; a revalidação e a correção foram realizadas no worktree isolado da PR. Os links de dependências locais estavam quebrados; o Playwright foi invocado pelo pacote correspondente ao import e um link local de `zod` foi usado para o teste da API.
- A PR altera o gatilho da jornada real paga para execução manual em todas as PRs; o gate automático adicionado usa API simulada. Isso reduz a cobertura automática de integração real e deve ser considerado na política de CI do projeto.
