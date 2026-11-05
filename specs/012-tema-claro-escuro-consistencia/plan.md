# Implementation Plan: Consistência de Tema Claro/Escuro — Correção Definitiva

**Branch**: `012-tema-claro-escuro-consistencia` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-tema-claro-escuro-consistencia/spec.md`

## Summary

O modo escuro do Ady foi construído corretamente desde o início; o modo claro foi remendado por cima com um bloco CSS de `!important` genérico (`index.css:322-462`) que compensa componentes/telas sem consciência de tema. Essa investigação confirmou (por leitura de código, não suposição): (1) 4 telas com bug pontual de tematização; (2) o bloco CSS genérico tem raio de impacto real sobre pelo menos 26 arquivos não auditados; (3) a causa raiz mais profunda é que o componente de design system `Button.tsx` é hardcoded para paleta escura sem nenhuma variante clara — o bloco CSS existe, em boa parte, para disfarçar esse buraco; (4) há uma violação sistemática e não documentada da regra de contraste do guia de marca (`#1E88A8` como cor de texto sobre fundo claro) em 25 pontos fora do escopo original de 4 arquivos.

Este plano decide **o que fazer com o bloco CSS genérico agora** (decisão principal — mantê-lo intacto, Abordagem C) e, após o usuário pedir explicação de impacto antes de decidir, **traz os dois achados que ultrapassavam o escopo original para dentro da execução**: `Button.tsx` (KF-001, causa raiz real, 9 arquivos consumidores, zero sobreposição com o resto do escopo) e as ocorrências de contraste (KF-002, troca de valor isolada, sem CSS compartilhado — **21 ocorrências em 9 arquivos, número corrigido na 3ª verificação; a contagem original de 25/12 citada abaixo nesta seção é o valor histórico do momento da decisão, não o final**). Ambos avaliados como baixo risco / alto valor e incluídos por decisão explícita registrada em `spec.md`.

## Decisão Principal — O que fazer com `index.css:322-462`

### Contexto da decisão

O bloco `html:not(.dark) { ... }` tem ~140 linhas com seletores de dois tipos:
- **Seletores de tag solta** (`span`, `p`, `h1`-`h4`, `label`, `aside`, `form`, `main button`): alto risco, atingem qualquer elemento da árvore, incluindo componentes que já fazem `dark:`/claro corretamente por conta própria (confirmado: quebra o hover do `GoogleLoginButton.tsx` e o texto do botão em `AssinaturaVencida.tsx`).
- **Seletores de família de utilitário Tailwind** (`bg-gray-*`, `bg-zinc`, `bg-slate`, `bg-neutral`, `bg-stone`): médio risco, mas confirmadamente usados em 26 arquivos não auditados nesta sessão — não sabemos hoje quantos desses já têm `dark:` próprio (redundância inofensiva) e quantos dependem 100% do bloco genérico para funcionar em claro (dependência real).

O detalhe que muda o cálculo de risco: **`Button.tsx`, o componente de botão mais reutilizado da aplicação, não tem nenhuma variante clara** — ele é hardcoded `bg-[#1A1B17] text-[#ECEDEF] border-[#262824]` (paleta escura) na variante `default`. Isso significa que **parte do que o bloco CSS genérico corrige hoje é, na prática, o único motivo pelo qual botões da aplicação não aparecem escuros sobre fundo claro** — embora, como a 5ª verificação (2026-08-26) precisou, o mecanismo exato varia por variante e por consumidor: `<main>` só existe em 4 lugares do app (`AppLayout.tsx`, `ConectarMetaPage.tsx`, `SelecionarAtivosPage.tsx`, `AdminShell.tsx`), então a regra `main [class*="bg-["]` só bate de fato em 2 dos 9 consumidores de `Button`; nos outros 7, quem afeta é a regra `.flex button:not(...)` (via o `.flex` do `AuthenticatedShell`), que só força borda/texto, não fundo — ver `spec.md` para o detalhamento variante-a-variante. Remover o bloco sem antes dar consciência de tema a `Button.tsx` (e a outros componentes na mesma situação, ainda não mapeados) continua quebrando visualmente qualquer tela que use esse componente, mesmo que o mecanismo varie.

### Abordagens comparadas

**Abordagem A — Remover o bloco inteiro e garantir que cada componente afetado tenha `dark:`/claro explícito**

- *Como funcionaria*: apagar `index.css:322-462`; para cada regressão visual encontrada, corrigir o componente na origem (adicionar variantes Tailwind ou usar tokens `--color-*`).
- **Prós**: elimina a causa do remendo recorrente de uma vez; força cada componente a ser correto por si só; zero débito técnico residual em CSS global.
- **Contras**: o raio de impacto real é desconhecido — cobre 26+ arquivos não auditados a fundo, mais qualquer tela do dashboard/admin que hoje dependa do bloco sem estarmos cientes. Sabemos que pelo menos `Button.tsx` quebra globalmente sem substituto. Fazer isso de forma segura exigiria, antes, um refactor do design system (`Button.tsx` e possivelmente outros) — que está explicitamente fora do escopo definido pelo usuário para esta fase. Executar Abordagem A sem esse pré-requisito é **alto risco de regressão visual em produção**, sem cobertura de teste visual automatizado (frontend tem 0% de cobertura de testes hoje).

**Abordagem B — Manter o bloco, mas trocar seletores genéricos por classes de escopo específicas**

- *Como funcionaria*: para cada regra do bloco, criar uma classe de escopo (`.auth-form`, `.billing-card`, `.legacy-light-surface`) e aplicá-la manualmente nos componentes que hoje dependem da regra genérica; depois trocar o seletor CSS de `main [class*="bg-slate"]` para `.legacy-light-surface`. Reduz o raio de dano sem reescrever tudo de uma vez.
- **Prós**: risco imediato baixo — nada quebra até a classe de escopo ser explicitamente adicionada; permite migração incremental, arquivo por arquivo, com checagem visual a cada passo; não depende de resolver `Button.tsx` primeiro.
- **Contras**: exige tocar em muitos arquivos só para adicionar uma classe "marcador" (trabalho mecânico, mas real); no fim ainda existe um CSS global com `!important`, só que com seletor mais estreito — não elimina o padrão de "remendo global", apenas o tornou mais seguro. É uma solução de transição, não definitiva.

**Abordagem C — Não tocar no bloco agora; resolver a causa raiz primeiro (tornar `Button.tsx` e componentes-chave theme-aware), então remover o bloco regra por regra conforme cada dependência é eliminada**

- *Como funcionaria*: nesta fase, tratar o bloco como **imutável** (não remover nem reduzir), exceto pelas 2-3 regras especificamente comprovadas como causadoras de bug nos 4 arquivos em escopo (linhas 382-386 hover de botão, 447-452 `span`/`p`/`label` genérico) — essas podem ser neutralizadas *localmente* nos componentes afetados (dar ao componente uma classe/seletor mais específico que vença o `!important` por especificidade, ou reescrever o componente para não depender de `span`/`p`/`bg-white` cru). O restante do bloco fica como está, documentado como débito técnico conhecido, até uma spec futura (013) resolver `Button.tsx` e os demais componentes theme-unaware — só então a Abordagem A se torna segura de executar.
- **Prós**: zero risco de regressão em telas fora do escopo auditado; respeita literalmente o limite de escopo pedido ("nenhum refactor maior de design system" nesta fase); não faz trabalho descartável (ao contrário da Abordagem B, que cria classes de transição que serão jogadas fora quando `Button.tsx` for corrigido).
- **Contras**: o bloco genérico continua existindo e continua sendo fonte de futuras inconsistências para qualquer tela nova; não resolve nada "definitivamente" — é uma decisão de adiar a remoção real para depois do pré-requisito.

### Decisão tomada

**Abordagem C, com uma peça pontual de A**: manter o bloco `html:not(.dark)` como está nesta fase, exceto pelas regras que comprovadamente quebram os 4 arquivos já em escopo (`AssinaturaVencida.tsx`, e o hover do `GoogleLoginButton.tsx` via `LoginPage.tsx`) — essas são corrigidas *no componente*, sem remover a regra CSS geral, usando seletores mais específicos que vençam por especificidade (ex.: `.assinatura-vencida-cta span { color: inherit !important; }`) ou reescrevendo o markup para não cair no seletor genérico (ex.: trocar `<span>` solto por um elemento com classe própria).

**Justificativa**: a Abordagem A é a única "definitiva" de verdade, mas sua pré-condição (design system theme-aware) está explicitamente fora do escopo desta fase — executá-la mesmo assim significaria ignorar a instrução do usuário e assumir um risco de regressão que não temos como medir (0% de cobertura de teste visual, 26 arquivos não auditados). A Abordagem B produz trabalho de transição que provavelmente é descartado assim que a Abordagem A se tornar viável — não vale o custo agora. A Abordagem C entrega o que dá para entregar com segurança nesta fase (os 4 arquivos + achados pontuais do bloco) e deixa uma trilha clara (KF-001 em `spec.md`) para quando a Abordagem A puder ser executada com segurança, numa spec 013 dedicada a tornar `Button.tsx` (e outros componentes na mesma situação) theme-aware.

### Plano de rollout (dentro da Abordagem C)

1. Auditoria de raio de impacto do bloco `html:not(.dark)` sobre os 26 arquivos que usam `bg-gray-*`/`bg-zinc`/`bg-slate`/`bg-neutral`/`bg-stone` (grep + leitura rápida de cada um) — **sem alterar nada**, só documentar quais dependem do bloco e quais já têm `dark:` redundante. Isso vira input para a spec 013.
2. Corrigir os 4 arquivos em escopo, **sem tocar no bloco CSS compartilhado** — resolver por especificidade/markup no próprio componente.
3. Para cada correção, verificar visualmente a tela afetada **e** uma amostra de 2-3 telas que usam os mesmos seletores genéricos (ex., se mexer em algo que toca `main button:not([type=submit])`, checar também `Dashboard.tsx` e `Metas.tsx`, que usam padrão parecido) — para confirmar que a mudança é local e não vazou.
4. Nenhuma regra do bloco genérico é **removida** nesta fase — só regras específicas, pontuais, são adicionadas *fora* dele (CSS module, classe própria, ou estilo inline com maior especificidade) para vencer o `!important` onde necessário.

## KF-006 — sinalização de status quebrada em `Metas.tsx` (achado da 3ª verificação, 2026-08-26) — recomendação

Ver `spec.md` para o achado completo. Resumo técnico: 4 `<span>` condicionais em `Metas.tsx` (79, 244, 277, 316) e 2 `<button type="button">` ("Reenviar código") são mascarados hoje pelo bloco genérico (`index.css:448` e `:375-386`) — a cor real nunca aparece, os dois ramos condicionais renderizam idênticos em modo claro.

**Recomendação**: tratar os 4 `<span>` de `Metas.tsx` com a mesma técnica de marker class de T024/T013 — é o caso que mais importa (perda de sinal funcional real, não só estética), o custo marginal é baixo (mesma técnica já sendo aplicada 2x nesta spec, só mais 4 pontos), e sem isso a spec deixaria um bug funcional conhecido sem corrigir depois de já ter investido em encontrá-lo. Os 2 botões "Reenviar código" são de menor prioridade (não carregam sinal condicional, só perdem a cor de marca em favor de um cinza neutro que ainda é seguro) — podem ficar só com a troca de valor (T030) sem a técnica de escape, documentado como aceito.

**Decisão do usuário (2026-08-26): documentar e adiar** (T034 marcado como SKIPPED conscientemente em `tasks.md`). O bug funcional de `Metas.tsx` continua existindo em modo claro após esta spec — candidato a spec 013.

## Achado de contraste — decisão de escopo (KF-002) — REVISADA em 2026-08-26

25 ocorrências de `text-[#1E88A8]` como cor de texto real (não ícone) em 12 arquivos, fora dos 4 já em escopo, violam a regra do guia de marca (contraste 3.49:1 < 4.5:1 AA para texto normal). É uma mudança mecânica (trocar `#1E88A8` por `#17708A` no valor da classe), mas atinge páginas centrais e de alto tráfego (`Dashboard.tsx`, `Metas.tsx`, `Plans.tsx`, `Subscription.tsx`, `ConfiguracoesTabsNav.tsx`), não só telas de auth/onboarding.

**Decisão original desta sessão**: não incluir, virar spec 013. **Revertida pelo usuário após pedido de explicação de impacto/necessidade.** Reavaliação: diferente do bloco `index.css:322-462` (CSS global, seletor compartilhado, raio de dano imprevisível), cada uma dessas 25 ocorrências é uma classe Tailwind arbitrária local ao componente — mudar uma não tem nenhum efeito sobre as outras 24 nem sobre nada fora do arquivo. O "volume" (12 arquivos) é uma questão de quantidade de verificação visual, não de risco de regressão em cascata. Combinado com o fato de ser uma violação direta e documentada do guia de marca do próprio usuário, o custo de adiar é maior que o custo de fazer agora.

**Decisão final**: **incluir nesta fase** (FR-009 em `spec.md`). Os usos dentro de `apps/web/src/components/ui/button.tsx` (variantes `outline`/`soft`) **não** são tratados aqui como swap de valor — são resolvidos como parte da correção de `Button.tsx` abaixo, via token semântico, para não deixar mais um hardcode que precisará ser revisitado quando o componente for tematizado de verdade.

## Decisão sobre `Button.tsx` (KF-001) — adicionada em 2026-08-26

### Reavaliação de risco

A decisão original (Abordagem C) tratava `Button.tsx` como fora de escopo por medo de que corrigi-lo tivesse raio de impacto equivalente ao de mexer no bloco CSS genérico ("a maioria da aplicação"). Levantamento por grep, feito antes desta decisão, mostra que isso superestimava o risco:

- `<Button>` é importado em **9 arquivos**: `components/campaign-wizard/CampaignWizard.tsx`, `components/campaign-wizard/steps/InstagramPostsTab.tsx`, `components/campaign-wizard/steps/Step5Review.tsx`, `pages/onboarding/ConectarMetaPage.tsx`, `pages/billing/Subscription.tsx`, `pages/planejador/components/CalendarView.tsx`, `pages/billing/Plans.tsx`, `pages/onboarding/MetasPage.tsx`, `pages/configuracoes/PublicoContent.tsx`.
- **Zero sobreposição** com os 4 arquivos já corrigidos nesta spec (`AssinaturaVencida.tsx`, `MetaAuthorizePage.tsx`, `NotFoundPage.tsx` usam `<button>`/`<a>` estilizados diretamente, não o componente `Button`).
- A mudança de código fica contida em **1 arquivo** (`button.tsx`, ~50 linhas, 7 variantes). O que é largo é a lista de telas a reverificar depois — 9 arquivos, lista fechada e conhecida, não "o app inteiro".

### Abordagem de implementação escolhida: tokens semânticos, não pares hex+`dark:`

Duas formas de tornar `Button.tsx` theme-aware foram consideradas:

- **Hardcode com par claro/escuro** (o padrão já usado em `RegisterFormPage.tsx`/`LoginPage.tsx`, ex. `bg-[#f3f6f8] dark:bg-[#0c0d0a]`): consistente com o resto do código de auth, mas cria mais uma fonte hardcoded que precisará ser editada manualmente se a paleta mudar de novo no futuro.
- **Tokens semânticos já definidos em `index.css:13-102`/`:107-164`** (`bg-surface`, `text-text-primary`, `border-border`, `bg-admin-petrol`, etc. — que já resolvem para o valor certo em cada tema via `:root`/`.dark`): mesma quantidade de trabalho agora, mas o componente passa a herdar qualquer ajuste de paleta futuro automaticamente, sem precisar tocar em `button.tsx` de novo. Escolhida.

**Decisão**: reescrever as 7 variantes de `button.tsx` usando os tokens semânticos existentes (introduzindo novos tokens `--color-button-*` em `index.css` `@theme` **apenas** se nenhum token existente cobrir um caso — ex. a variante `default` hoje não tem equivalente óbvio entre os tokens de admin/app; avaliar na implementação se `bg-surface`/`border-border`/`text-text-primary` servem ou se precisa de um par novo). Isso é consistente com o objetivo declarado do usuário ("não quero ficar arrumando isso toda hora") — resolve pela raiz, não por mais um remendo pontual.

### ATUALIZAÇÃO — Verificação profunda de 2026-08-26 (pedida pelo usuário antes de autorizar execução)

O usuário pediu confirmação independente, com ceticismo, de que este plano resolveria o problema sem criar outros e sem interferir em outros componentes. Rodei duas investigações dedicadas (uma sobre o bloco CSS + outros componentes de design system, outra sobre as 25/29 ocorrências de KF-002 em contexto real). Resultado: **o plano como estava até aqui tinha duas lacunas reais que teriam gerado bugs novos ou deixado o trabalho incompleto.**

**Lacuna 1 — corrigir `button.tsx` sozinho não bastava.** Confirmado por leitura direta: `index.css:352-358` (`html:not(.dark) main [class*="bg-["]...`) tem especificidade maior que qualquer classe que `button.tsx` venha a usar, e `index.css:375-386` faz o mesmo com a cor de texto. Testado o cálculo de especificidade contra a regra existente que tenta colorir o botão primário (`:388-398`) — a regra do card genérico vence. **Hoje, todo `<Button>` dentro de `<main>` em modo claro já perde fundo e texto para as cores forçadas do bloco, virando um botão cinza genérico independente da variante.** Corrigir só as classes do componente não muda esse comportamento; o bloco continuaria vencendo. Isso vira FR-010/task nova (ver abaixo) — uma exceção **aditiva** no CSS (marker class), no mesmo padrão já usado para `.gradient-teal`/`.gradient-spark`, sem remover nenhuma regra existente.

**Lacuna 2 — `card.tsx` tem o mesmo problema de `button.tsx`.** Mesmo padrão (hardcoded `bg-[#161814]`/`text-[#ECEDEF]`/`border-[#262824]`, zero `dark:`). Só 1 consumidor (`MetasPage.tsx`), incluído no mesmo esforço sem custo relevante adicional.

**Lacuna 3 — KF-002 como estava listado teria introduzido 8 bugs novos.** Verificação linha-a-linha encontrou que 8 das ocorrências listadas estão dentro de **cards sempre escuros** (`RoadmapPage.tsx`, `Plans.tsx:187,271`, `Subscription.tsx:257`, `Dashboard.tsx:304,482,493,579` — todos com `bg-[#161814]` hardcoded, sem `dark:`, independentes do tema do app). Trocar `#1E88A8`→`#17708A` nesses textos pioraria o contraste (a cor nova foi calibrada para fundo claro, não para esses cards escuros fixos). **Removidos da lista de edição.** A tabela também tinha um erro de contagem (dizia 25, somava 29) e faltavam 2 ocorrências reais (`Dashboard.tsx:163`, `ProgressGoal.tsx` — este último em componente morto, baixa prioridade). Tabela corrigida em `spec.md`: **21 ocorrências reais em 9 arquivos** (não 25 em 12).

**O que NÃO mudou**: `input.tsx`/`select.tsx` foram verificados e estão corretos (falso alarme) — só um bug pequeno e não relacionado (`disabled:bg-gray-50` hardcoded) foi encontrado, registrado à parte (KF-004), fora desta fase. Os 24 arquivos que usam `bg-gray-*`/`bg-zinc`/etc. foram reclassificados: a maioria usa só `bg-gray-*`, que **não é coberto** pelo bloco `html:not(.dark)` investigado (é coberto por um bloco separado, só ativo no modo escuro) — ou seja, o raio de dependência real desses 24 arquivos é bem menor do que a estimativa original. `FuryLiveFeed.tsx` confirmado como código morto (mesmo padrão de `AuthLayout.tsx`).

### Verificação reforçada de 2026-08-26 (build real + teste empírico de cascade layers)

O usuário pediu uma rodada adicional de verificação, com máxima precisão, antes de autorizar a execução. Em vez de confiar só em leitura de código, rodei `vite build` real (`apps/web`) e inspecionei o CSS compilado programaticamente.

**Achado 1 — mecanismo de precedência real, não o que a rodada anterior assumiu.** O bloco `html:not(.dark)` está **fora de qualquer `@layer`** no CSS final (profundidade de camada 0, confirmado por análise de chaves), enquanto todo utilitário do Tailwind v4 — inclusive classes de valor arbitrário (`bg-[#1E88A8]`) — vive dentro de `@layer utilities`. Pela especificação de CSS Cascade Layers, a prioridade entre regras `!important` se inverte: **`!important` dentro de layer vence `!important` fora de layer**, não importa a especificidade do seletor. A rodada anterior explicou o comportamento por cálculo de especificidade (o que também está correto para o caso de comparar duas regras dentro do MESMO bloco, ambas sem layer), mas a explicação de camadas é a correta para entender por que uma classe nova do `button.tsx` (sem `!`, dentro de layer, não-important) nunca teria chance contra o bloco (`!important`, sem layer) — nem precisa de cálculo de especificidade, `!important` sempre vence não-important primeiro.

**Achado 2 — a correção "óbvia" (`!`-prefixar as classes de `button.tsx`) foi testada e é insegura.** Como Tailwind `!bg-[...]` compila para `!important` dentro de `@layer utilities`, ela venceria o bloco genérico só por estar em layer — parecia uma correção mais simples que T024 (sem tocar `index.css`). Testei com um script real usando `twMerge` v3.6.0 (a mesma versão do projeto) simulando `Subscription.tsx:126`, que **hoje já sobrescreve as cores do `Button` via `className`** (`variant="primary" className="bg-[#1E88A8] hover:bg-[#1E88A8]/80 text-white"`). Resultado empírico: quando a base é `!important` e o override do consumidor não é, `twMerge` **não resolve o conflito** — ambas as classes ficam no `className` final, e a `!important` da base vence, silenciando a customização do consumidor sem nenhum erro visível. Descartada.

**Decisão confirmada**: T024 mantém a abordagem original — exceção aditiva por marker class nos seletores do bloco `html:not(.dark)` (não tornar as classes de `button.tsx`/`card.tsx` `!important`). Isso preserva o mecanismo de customização via `className`/`twMerge` (`Subscription.tsx`, e o caso análogo de `MetasPage.tsx` com `Card`) e tem precedente direto no próprio código: `index.css:375` já usa exatamente esse padrão (`:not(.ady-calendar-shell button)`) para blindar os botões do `CalendarView` do mesmo bloco. A marker class de `Button`/`Card` segue a mesma convenção já estabelecida.

**Segunda verificação reforçada (mesma sessão)** — dry-run manual de como T012 (retematização completa), T013 (colisão do `span` do CTA) e T030b (troca de cor no hover do mailto) se combinam no mesmo arquivo `AssinaturaVencida.tsx`, confirmando que tocam trechos disjuntos do arquivo (container/card/textos vs. o `<span>` do CTA vs. só o valor de cor do link de e-mail) — sem conflito entre si.

Nesse processo, recalculei a especificidade real do seletor de `index.css:448` (`span:not(.gradient-teal span):not(.gradient-spark span):not(.bg-accent *):not(.bg-accent)`): cada `:not()` soma a especificidade do seu argumento mais específico — total (0,4,3). A técnica original do T013 (`.cta-label { color: inherit !important }`, especificidade 0,1,0) **perderia** contra isso — as duas regras são `!important` e nenhuma está em `@layer` (mesmo caso do achado de T024, então a comparação é só especificidade), e (0,4,3) > (0,1,0). **Corrigido**: T013 agora usa a mesma técnica de T024 (estender o `:not()` da regra existente com `:not(.cta-label)`, não competir com uma regra nova). Isso também vira a convenção geral para qualquer colisão futura com este bloco: **sempre estender a lista de exclusões existente, nunca tentar vencer por especificidade com uma regra nova** — é mais barato, mais previsível, e não depende de recalcular especificidade toda vez.

**Especificação exata da mudança (para a implementação de T024)**:
- Selector `html:not(.dark) main [class*="bg-["]:not(.gradient-teal):not(.gradient-spark):not([class*="bg-primary-foreground"])` (`index.css:352`) → adicionar `:not(.ady-btn):not(.ady-card)`. Afeta `Button` (qualquer variante) e `Card` quando dentro de `<main>`.
- Selector `html:not(.dark) main button:not([type="submit"]):not(.bg-brand):not(.gradient-spark):not(.ady-calendar-shell button)` e seu par `:hover` (`index.css:375-386`) → adicionar `:not(.ady-btn)`. Só afeta `Button` (é um seletor de `button`, não pega `Card`, que renderiza `<div>`).
- Marker class (`ady-btn`, `ady-card`, ou nome equivalente) DEVE ser uma classe simples, não-Tailwind, adicionada ao array de classes base de `Button`/`Card` (não `!important`, não classe utilitária) — não interfere com `twMerge` (que só reconhece sintaxe de utilitário Tailwind, ignora classes arbitrárias na resolução de conflito).
- Nenhuma regra existente do bloco é removida ou reescrita — só o `:not()` é estendido, no mesmo espírito de tudo que já foi decidido para esta spec.

### Efeito sobre a Decisão Principal (bloco CSS genérico)

Corrigir `Button.tsx` **remove uma das dependências** do bloco `html:not(.dark)` (especificamente o seletor `main [class*="bg-["]...` de `index.css:352-358`, que hoje força fundo branco em qualquer `bg-[...]` dentro de `<main>` — incluindo, please note, **qualquer variante de `Button` renderizada dentro de `<main>`, mesmo `spark`/`primary`**, o que é uma sobrescrita mais agressiva e menos previsível do que se pensava originalmente). Isso **não** torna segura a remoção do bloco inteiro nesta fase — os 26 arquivos com `bg-gray-*`/`bg-zinc`/`bg-slate` (auditados só por leitura superficial, não por reescrita) continuam uma dependência real e não resolvida. A Abordagem C (não remover o bloco) permanece a decisão vigente para o bloco em si; corrigir `Button.tsx` é um passo que **reduz o raio de dependência futuro** sem exigir a remoção agora.

## Achados adicionais tratados nesta fase

- **Opacidade do grid de fundo** (`opacity-[0.03]` claro vs `dark:opacity-[0.05]` escuro): decisão objetiva baseada em contraste perceptível, não arbitrária. `#1E88A8` a 3% sobre `#f3f6f8` (luminância de fundo alta) resulta em diferença de luminância muito pequena — visualmente quase nula. Duas opções válidas: (a) subir a opacidade no claro para compensar a luminância alta do fundo (ex. `opacity-[0.08]`–`opacity-[0.10]`, testado visualmente até o padrão de pontos ficar perceptível sem competir com o conteúdo); (b) manter a opacidade baixa mas usar uma cor com mais contraste contra fundo claro (`#17708A`, já aprovado para claro). Recomendação: opção (a) primeiro (mudança de uma linha, mesma cor em ambos os temas, mantém a identidade visual do "ponto de petróleo"); só migrar para (b) se (a) não for suficiente na checagem visual.
- **`AuthLayout.tsx`**: remoção direta, sem CSS/rollout envolvido — grep já confirmou zero imports ativos.
- **`/painel`**: sem código a alterar (achado documentado em `spec.md`, sem task de implementação).

## Constitution Check

*Gate do projeto (`.specify/memory/constitution.md`), adaptado para trabalho de frontend/CSS sem camada de serviço:*

| Gate | Status | Rationale |
|------|--------|-----------|
| I. Security & Multi-Tenant Isolation | N/A | Sem acesso a dado de tenant; mudança é puramente visual/frontend. |
| II. API Contracts & Validation | N/A | Nenhum endpoint tocado. |
| III. Test-First Quality Gates | ⚠️ DESVIO DOCUMENTADO | Frontend tem 0% de cobertura de teste (`CLAUDE.md`, QA state). Não há suíte de teste visual automatizada para regressão de CSS/tema. Verificação substituída por: (a) checklist manual multi-tela/multi-tema em `tasks.md`, (b) auditoria objetiva de contraste via `accesslint` (`mcp__plugin_accesslint_accesslint__audit_live`). Isso é uma mitigação, não um substituto equivalente a teste automatizado — registrado como risco em aberto. |
| IV. AI Integration Discipline | N/A | Sem chamada a IA. |
| V. Simplicity & YAGNI | ✅ PASS | Abordagem C evita refactor especulativo de design system fora de escopo; resolve só o que está confirmado quebrado. |
| VI. Build-Before-Deploy Gate | ✅ PASS (aplica na implementação) | `tsc -b && npm run build` deve passar antes de qualquer merge desta fase — mudança é CSS/TSX, sem novo código de lógica, risco de quebra de build é baixo mas o gate continua obrigatório. |
| VII. Layer Separation & Code Quality | N/A | Sem camadas de service/controller envolvidas. |

## Project Structure

### Documentação desta feature

```text
specs/012-tema-claro-escuro-consistencia/
├── spec.md      # Problema, achados validados, escopo, FR/SC, achados fora de escopo (KF)
├── plan.md      # Este arquivo — decisão de arquitetura + rollout
└── tasks.md     # Checklist ordenado por risco crescente (Fase 2, ainda não implementado)
```

### Arquivos afetados (implementação futura, fora desta fase)

```text
apps/web/src/
├── index.css                                  # regras pontuais NOVAS (não remoção do bloco existente); possíveis tokens --color-button-* novos
├── pages/billing/AssinaturaVencida.tsx         # tematização completa claro+escuro
├── pages/onboarding/MetaAuthorizePage.tsx      # !text-[#ECEDEF] → text-admin-text
├── pages/NotFoundPage.tsx                      # conteúdo de marca FURY → ady
├── components/AuthLayout.tsx                   # REMOVER (código morto)
├── components/ui/button.tsx                    # 7 variantes → tokens semânticos, theme-aware (KF-001)
├── pages/auth/{LoginPage,RegisterFormPage,ForgotPasswordPage,ResetPasswordPage,ResetPasswordSuccessPage}.tsx
│                                                # opacidade do grid de fundo (valor único, mesmo padrão nos 5 arquivos)
├── (9 arquivos da tabela KF-002 REVISADA em spec.md, era 12 antes da 3ª verificação)    # text-[#1E88A8] → text-[#17708A] como cor de texto
└── (9 arquivos consumidores de <Button>)        # sem edição própria — só reverificação visual pós button.tsx
```

## Checklist geral do plano (master — usar antes de considerar a spec 012 concluída)

Este é o checklist de fechamento. Os checklists por fase, mais granulares, estão em `tasks.md` ao final de cada fase.

- [ ] Decisão principal lida e aceita: bloco `html:not(.dark)` **não é removido nem reduzido** nesta fase (Abordagem C) — só recebe adições pontuais fora dele.
- [ ] `Button.tsx` e `Card.tsx` (KF-001 + KF-001-B) reescritos com tokens semânticos, verificado nos 9 arquivos consumidores, nos dois temas, **inclusive dentro de `<main>`**.
- [ ] Exceção aditiva (FR-010) adicionada a `index.css:352-358` e `:375-386` para que `Button`/`Card` corrigidos não voltem a ser sobrescritos pelo bloco genérico.
- [ ] As 21 ocorrências confirmadas de KF-002 (9 arquivos, tabela revisada em `spec.md`) corrigidas de `text-[#1E88A8]` → `text-[#17708A]` como cor de texto — **e nenhuma das 8 ocorrências excluídas (cards sempre-escuros) foi tocada por engano**.
- [ ] Os 4 bugs pontuais originais (`AssinaturaVencida`, `MetaAuthorizePage`, `NotFoundPage`, `AuthLayout`) corrigidos sem tocar em nenhuma regra existente do bloco CSS genérico.
- [ ] Auditoria de raio de impacto do bloco (26 arquivos `bg-gray-*`/`bg-zinc`/`bg-slate`/`bg-neutral`/`bg-stone`) documentada, mesmo sem alteração — vira input para uma eventual spec 013.
- [ ] Verificação de contraste via `accesslint` rodada nas rotas de SC-002 e nos 9 arquivos de `Button.tsx`, todos ≥ AA.
- [ ] Verificação manual multi-tema feita em todas as telas afetadas (SC-006), incluindo as 2-3 telas de controle (Dashboard/Metas) para confirmar que nada vazou do bloco CSS genérico.
- [ ] `tsc -b && npm run build` passa (Constitution VI).
- [ ] Nenhum achado (KF-003 `/painel`, ou qualquer novo componente theme-unaware descoberto durante a auditoria) foi perdido silenciosamente — está em `spec.md` ou virou task nova.

## Riscos e decisões em aberto

- **Risco alto, mitigado por escopo**: remover ou reduzir o bloco CSS genérico sem antes corrigir todos os componentes theme-unaware quebraria a aplicação. Mitigação: Abordagem C não remove o bloco; `Button.tsx` é corrigido como item isolado, não como gatilho para mexer no bloco.
- **Risco médio, não eliminado**: os 26 arquivos que usam `bg-gray-*`/`bg-zinc`/`bg-slate` não foram auditados individualmente nesta sessão — é possível que algum deles dependa de uma regra específica do bloco de forma que só será descoberta quando essa regra for tocada no futuro (spec 013). Mitigação: tarefa de auditoria em `tasks.md` documenta o estado atual antes de qualquer remoção futura.
- **Risco baixo**: adicionar classes/seletores específicos para vencer `!important` nos 4 arquivos em escopo pode, em teoria, colidir com outra regra não mapeada do bloco. Mitigação: checklist de verificação visual multi-tela.
- **Risco baixo, novo**: corrigir `Button.tsx` para usar tokens semânticos pode expor que nenhum token existente cobre a variante `default` adequadamente, exigindo criar 1-2 tokens novos em `index.css`. Mitigação: decisão de criar token novo só se nenhum existente servir, avaliada durante a implementação (ver `plan.md`, seção "Decisão sobre Button.tsx").
- **Resolvido nesta sessão**: KF-001 e KF-002 estavam com decisão em aberto (Q1/Q2 em `spec.md`) e foram trazidos para dentro do escopo desta fase após o usuário pedir explicação de impacto/necessidade — ver seções acima para o raciocínio completo.
