# Feature Specification: Consistência de Tema Claro/Escuro — Correção Definitiva

**Feature Branch**: `012-tema-claro-escuro-consistencia`

**Created**: 2026-08-26

**Status**: Executado (2026-08-26) — ver `HANDOFF.md` para o estado real pós-execução e `tasks.md` Fase 9 para o trabalho adicional encontrado durante a implementação, além do plano original.

**Input**: "O produto está sendo rebrandeado de Fury (laranja) para ady (petróleo #1E88A8/#17708A). O modo escuro foi implementado primeiro e ficou correto; o modo claro foi adaptado depois 'por cima' e ficou cheio de inconsistências, corrigidas manualmente uma a uma sem resolver a causa raiz. Produzir um plano de correção definitivo, com rigor de 'expert critic': comparação de abordagens, decisão justificada, checklist de revisão e critérios objetivos (contraste WCAG). Não implementar nada ainda — só o plano."

## Problema

O tema claro do Ady foi construído como uma camada de patches sobre um tema escuro que já estava correto, em vez de ser tratado como cidadão de primeira classe do design system. Isso produziu três classes de defeito distintas, todas confirmadas nesta investigação por leitura direta do código (não por suposição):

1. **Um bloco CSS de "correção geral" com escopo amplo demais** (`apps/web/src/index.css:322-462`, seletor raiz `html:not(.dark) { ... }`) que usa `!important` sobre tags soltas (`span`, `p`, `h1`-`h4`, `button`, `form`, `aside`) e classes utilitárias Tailwind genéricas (`bg-gray-*`, `bg-zinc-*`, `bg-slate-*`, `bg-neutral-*`, `bg-stone-*`) em vez de tokens semânticos do tema (`--color-*`). Esse bloco funciona como rede de segurança para telas que nunca receberam estilo de modo claro próprio, mas também **sobrescreve estilos intencionais** de componentes que já fazem `dark:`/claro corretamente (achado confirmado, ver seção seguinte).
2. **Páginas individuais sem tratamento de tema** (hardcoded para um dos dois modos, ignorando o toggle do usuário).
3. **Uma causa raiz mais profunda, descoberta nesta investigação**: o componente de design system `apps/web/src/components/ui/button.tsx` (usado em toda a aplicação) é hardcoded para paleta **escura** (`bg-[#1A1B17]`, `text-[#ECEDEF]`, `border-[#262824]`) e **não possui nenhuma variante `dark:`/clara**. Isso explica por que o bloco CSS genérico do item 1 existe: ele é o mecanismo que hoje impede que todo botão da aplicação apareça escuro sobre fundo claro. Remover o bloco sem primeiro dar consciência de tema ao `Button.tsx` quebra visualmente qualquer tela que use esse componente.

## Contexto — Código Existente (validado nesta sessão)

### Fonte de verdade do tema (correta, não mexer)

- `apps/web/src/index.css:13-102` — variáveis CSS para `:root`/`html[data-theme="claro"]` e `.dark`/`html[data-theme="escuro"]`. Bem definidas, cobrem fundo, superfície, sidebar, tipografia, bordas, aliases de admin e paleta do Planejador IA.
- `apps/web/src/index.css:107-164` — bloco `@theme` do Tailwind v4 mapeando as variáveis acima para `--color-*` (`bg-background`, `text-text-primary`, `bg-admin-surface`, etc.). Correto.
- `apps/web/src/components/providers/ThemeProvider.tsx` — aplica o tema **globalmente** em `<html>` a partir de `authSlice.theme` (Redux), adicionando/removendo `.dark`, `data-theme` e `color-scheme`. O tema **não é por rota**: uma vez setado, vale para qualquer página, inclusive rotas standalone fora do `AuthenticatedShell` (ex. `/assinatura-vencida`).

### Bloco de overrides genéricos — `apps/web/src/index.css:322-462`

Seletor raiz `html:not(.dark) { ... }`. Achados específicos confirmados por leitura:

- **Linhas 375-386**: `main button:not([type="submit"])...`, `.flex button:not([type="submit"])...` força borda/cor em botões secundários e, no `:hover` (382-386), `background-color: #f1f5f9 !important; color: #0f172a !important`. Confirmado que isso alcança `apps/web/src/components/auth/GoogleLoginButton.tsx:46` (que já define `hover:bg-white` corretamente) porque o botão (`type="button"`) está dentro de um contêiner `.flex` em `LoginPage.tsx:89`. O hover customizado nunca é aplicado — efeito visual é pequeno (cores próximas) mas o mecanismo está confirmado quebrado.
- **Linhas 447-452**: `span:not(.gradient-teal span):not(.gradient-spark span):not(.bg-accent *):not(.bg-accent), p:not(...), label, .text-muted-foreground { color: #475569 !important; }`. Confirmado que isso atinge `apps/web/src/pages/billing/AssinaturaVencida.tsx:79` (`<span>Ver planos disponíveis</span>` dentro de link `bg-[#1E88A8] text-white`) — o texto branco do botão vira cinza-escuro sobre fundo azul, contraste ruim e visual quebrado.
- **Linhas 352-365**: `main [class*="bg-zinc"]`, `main [class*="bg-slate"]`, `main [class*="bg-neutral"]`, `main [class*="bg-stone"]`, `main .bg-surface`, `form` recebem `background-color: #ffffff !important; border: 1px solid #e2e8f0 !important; ...`. Grep confirma **26 arquivos** em `apps/web/src` usando `bg-gray-*`/`bg-zinc`/`bg-slate`/`bg-neutral`/`bg-stone` (não auditados individualmente nesta sessão) — esse é o raio de impacto real do bloco, muito maior que as 4 telas investigadas a fundo.
- **Linhas 388-398**: força `#1E88A8`/branco em `.bg-primary`, `.bg-brand`, `form button[type="submit"]`. Redundante com o que os componentes corretos já fazem (`RegisterFormPage.tsx`), mas não é, por si, prejudicial.
- Regras específicas de `.icon-meta-circle`, `.progress-fill-bar`, `.filter-pill-active`, `.quick-create-btn`, `.chip-active` (linhas 465-498) são "correções pontuais" adicionadas por cima do bloco genérico — sintoma do mesmo padrão de remendo incremental.

### Arquivos com bug confirmado (não dependem do bloco genérico, precisam de tematização própria)

1. **`apps/web/src/pages/billing/AssinaturaVencida.tsx`** — zero variantes `dark:`, 100% hardcoded para claro (`bg-[#f3f6f8]`, `text-slate-900`, `bg-white`, `border-slate-200`, `text-slate-500/600/700/400`). Rota standalone (`router.tsx:150-153`), fora de qualquer wrapper de tema.
   - **Achado adicional, mais grave que "não respeita o toggle"**: como `ThemeProvider` aplica `.dark` globalmente e o bloco `.dark .bg-white { background-color: var(--color-surface) !important; }` (`index.css:262-267`) está ativo sempre que o usuário tem o tema escuro selecionado, o card em `bg-white` (linha 38) **vira fundo escuro** (`#141512`) via `!important`, mas o texto continua hardcoded `text-slate-900` (`#0f172a`, quase preto) — texto quase ilegível sobre fundo escuro. Ou seja: com tema escuro selecionado, essa tela fica **pior que "não muda"** — fica quebrada.
   - Padrão correto a seguir já existe em `apps/web/src/pages/auth/RegisterFormPage.tsx` e `LoginPage.tsx` (`bg-[#f3f6f8] dark:bg-[#0c0d0a]`, `text-slate-900 dark:text-white`, grid de fundo com `opacity-[0.03] dark:opacity-[0.05]`).
2. **`apps/web/src/pages/onboarding/MetaAuthorizePage.tsx`** — linhas 58, 107, 122 usam `!text-[#ECEDEF]` hardcoded (cor de texto do tema **escuro**) no `<h1>ady</h1>` e `<h2>Conectando ao Meta</h2>`, mesmo a página já usando `bg-admin-bg`/`text-admin-text`/`text-admin-text-muted` corretamente nos outros elementos. Deveria usar `text-admin-text` (já tematizado, `index.css:43` e `:89`). Página de onboarding para usuário comum — não deve ficar travada em escuro.
3. **`apps/web/src/pages/NotFoundPage.tsx`** — não é bug de tema, é rebrand esquecido: comentário (linha 6-7) cita "identidade FURY (laranja #e8631a)"; SVG com quadrado + `<text>F</text>` central hardcoded (linhas 104-122); rodapé "FURY — erro 404" (linha 213). O resto do arquivo já usa `var(--color-text-primary)` etc. corretamente — só o conteúdo de marca ficou para trás. Ícone de referência para substituição: `apps/web/src/components/AdySymbol.tsx` (usado em auth/onboarding).
4. **Rota `/painel`** — **investigado e não encontrado**: `grep -r "/painel" apps/web/src` não retorna nenhuma ocorrência (nem `Link`, nem `navigate`, nem definição de rota em `router.tsx`). A única ocorrência de "/painel" no repositório é `docs/DEPLOY.md:18`, que se refere ao painel EasyPanel (`painel.nerdrico.com.br`), sem relação com o app. **Conclusão**: não há evidência de bug de roteamento interno — o 404 relatado provavelmente veio de URL digitada manualmente ou link externo/antigo fora do código atual. Não há task de correção de código para isso nesta spec; se houver um link real quebrado (e-mail, landing page externa, bookmark), precisa ser apontado explicitamente para virar task.

### Não-bugs (confirmados corretos, não mexer)

- `apps/web/src/pages/superadmin/ForceDarkMode.tsx` + uso em `router.tsx:161,174` (`/admin/login` e `/admin`) — força `.dark` ao montar, restaura tema anterior ao desmontar. Padrão correto para travar superadmin no escuro. Referência de "como forçar tema" se algum outro lugar precisar do mesmo comportamento.
- `apps/web/src/components/AuthLayout.tsx` — código morto confirmado: branding FURY laranja antigo (`#FF6B35`, "FURY" hardcoded, 3 ocorrências de `<span className="text-7xl font-black">F</span>` style). `grep -r AuthLayout apps/web/src` retorna só `components/index.ts` (barrel export) e o próprio arquivo — **nenhuma página importa o componente**. Seguro remover.
- `apps/web/src/pages/auth/{LoginPage,RegisterFormPage,ForgotPasswordPage,ResetPasswordPage,ResetPasswordSuccessPage,RegisterPage}.tsx` — já usam `dark:` corretamente e o mesmo padrão de grid de fundo com `opacity-[0.03] dark:opacity-[0.05]`. O "bug das bolinhas sumidas" não é ausência de `dark:` — é que `opacity-[0.03]` de `#1E88A8` sobre `#f3f6f8` é quase imperceptível (enquanto `opacity-[0.05]` sobre fundo quase-preto é visível). É questão de opacidade insuficiente no claro, não código quebrado.

## Achado novo — Violação da regra de contraste AA com `#1E88A8` como cor de texto

O guia de marca estabelece regra dura: **`#1E88A8` nunca deve ser usado como cor de TEXTO sobre fundo claro** (contraste medido 3.49:1, reprova AA para texto normal — WCAG 2.1 SC 1.4.3 exige ≥ 4.5:1 para texto normal, ≥ 3:1 para texto grande ≥ 24px ou ≥ 18.66px em negrito). `#17708A` (4.8:1) é a variante aprovada para texto sobre claro. `#1E88A8` continua válido como elemento gráfico (ícone, borda, fundo de botão) em qualquer contexto — WCAG SC 1.4.11 (non-text contrast) exige só 3:1 para esses casos, e 3.49:1 passa.

Grep de `text-\[#1E88A8\]` em `apps/web/src` retornou 47 ocorrências em 20 arquivos. Classificando por tipo de uso (ícone vs. texto real) e por se a tela é alcançável em modo claro (rotas fora de `/admin`, que é sempre forçado escuro):

**TABELA REVISADA em 2026-08-26** após verificação linha-a-linha em contexto real (a tabela original citava "25" mas somava 29; e classificava como violação 8 ocorrências que na verdade estão dentro de cards **sempre escuros**, hardcoded sem `dark:`, independentes do tema do app — trocar a cor ali pioraria o contraste em vez de corrigi-lo). Ver `plan.md` para o raciocínio completo da verificação.

**Violações confirmadas — texto/label real, tela alcançável em modo claro (21 ocorrências, 9 arquivos)**:

| Arquivo | Linhas | Tipo |
|---|---|---|
| `pages/configuracoes/ConfiguracoesTabsNav.tsx` | 31, 32 | label de aba ativa/hover |
| `pages/auth/ForgotPasswordPage.tsx` | 199 | link |
| `pages/auth/ResetPasswordPage.tsx` | 138, 290, 299 | link |
| `pages/auth/RegisterFormPage.tsx` | 186, 350 | link |
| `pages/auth/LoginPage.tsx` | 144, 217 | link |
| `pages/auth/RegisterPage.tsx` | 136 | link |
| `pages/billing/AssinaturaVencida.tsx` | 67 | link (hover) — **corrigir dentro da task T012 (retematização completa do arquivo), não como edição isolada, para evitar conflito de sequenciamento** |
| `pages/dashboard/Dashboard.tsx` | 163 (novo, não estava na tabela original), 189, 211 | número/badge — só dentro do `HeroStrip`, que é genuinamente `bg-white dark:bg-[#161814]` |
| `pages/dashboard/Metas.tsx` | 79, 172, 194, 244, 277, 316 | número/hover/link/texto condicional — `SURFACE` do arquivo é `bg-white dark:bg-[#161814]`, genuinamente theme-aware |

**Removidos da lista — falsos positivos, NÃO editar (texto correto como está)**:
- `pages/roadmap/RoadmapPage.tsx:139` — o próprio arquivo documenta (comentário, linhas 6-12) que é uma página autônoma sempre escura, não depende do tema do app.
- `pages/billing/Plans.tsx:187,271` — dentro de `DialogContent`/`PlanCard`, ambos `bg-[#161814]` hardcoded sem `dark:` — cards sempre escuros.
- `pages/billing/Subscription.tsx:257` — mesmo padrão, card `bg-[#161814]` hardcoded sempre escuro.
- `pages/dashboard/Dashboard.tsx:304,482,493,579` — dentro de `MetricCard`/`ActiveCampaignsTable`/`InstagramMetricCard`, todos usando a constante `SURFACE` com `bg-[#161814]` **sem** `dark:` — sempre escuros.
- `pages/dashboard/Dashboard.tsx:89` — define `STATUS_CONFIG.text`, mas o campo nunca é consumido no arquivo (código morto). Trocar o hex é inofensivo mas não corrige nada visível — opcional, baixa prioridade.
- `components/ProgressGoal.tsx:39-40` — herdaria a violação do pai, mas o componente inteiro está morto (zero imports em nenhuma página) — opcional, baixa prioridade, útil só se o componente for revivido no futuro.

**Fora da contagem de violação** (ícones/gráficos — passam pelo limiar de 3:1 de non-text contrast, ou estão em rotas sempre-escuras):
- Usos em `<Icon className="... text-[#1E88A8]" />` (decorativos, ~15 ocorrências em `Dashboard.tsx`, `Metas.tsx`, `MetricCard.tsx`, `ProgressGoal.tsx`, `GoogleLoginButton.tsx`, `AssinaturaVencida.tsx:64`, `ForgotPasswordPage.tsx:90`, `RoadmapPage.tsx:82,110`).
- `pages/superadmin/{TenantsPage,PlansPage,UsersPage}.tsx`, `components/layout/AdminShell.tsx` — dentro de `/admin`, sempre `.dark` via `ForceDarkMode`, nunca renderizado sobre fundo claro.

**Trocas que exigem atenção extra na implementação** (não são find-replace puro):
- `Metas.tsx:79,244,316` — cor condicional (`isGood`/`roas>=2`/`highlight`); precisa forçar os dois estados visualmente, não só olhar a tela default.
- `LoginPage.tsx:144`, `RegisterFormPage.tsx:186`, `ResetPasswordPage.tsx:290` — já têm `hover:text-[#17708A]` como estado de hover. Trocar a cor **base** para `#17708A` também deixa base e hover quase idênticos, perdendo a transição visual — avaliar se vale a pena ou se o ganho de AA compensa perder o efeito de hover.
- `#17708A` já é convenção estabelecida no código (`index.css:124,162,252`, e hover states em 7 arquivos de auth) — a troca não introduz um padrão novo.

**Causa raiz de maior alcance, não corrigível por find-replace pontual**: `apps/web/src/components/ui/button.tsx:31,47` (variantes `outline` e `soft`) usa `text-[#1E88A8]` como cor de texto padrão do componente de botão do design system — sem nenhuma variante `dark:`. Esse componente é hardcoded para paleta escura em toda a sua superfície (`bg-[#1A1B17]`, `text-[#ECEDEF]`, `border-[#262824]` na variante `default`), ou seja, o problema de contraste em `Button.tsx` é sintoma do problema maior (item 3 do "Problema", acima): o componente não é theme-aware. Corrigir só a cor de texto sem dar consciência de tema ao componente inteiro não resolve o caso geral.

**Decisão de escopo sobre este achado**: ver `plan.md`, seção "Achado de contraste — decisão de escopo".

### Achado adicional (verificação de 2026-08-26) — `card.tsx` tem o mesmo problema de `button.tsx`, e a correção de `button.tsx` sozinha não bastava

Uma rodada de verificação profunda, pedida pelo usuário antes de autorizar a execução, encontrou dois problemas que o plano original não cobria:

1. **`apps/web/src/components/ui/card.tsx:9,20,24` é theme-unaware, no mesmo padrão de `button.tsx`** (`bg-[#161814]`, `border-[#262824]`, `text-[#ECEDEF]` hardcoded, zero `dark:`). Só 1 consumidor hoje (`pages/onboarding/MetasPage.tsx:197`), e o bug não se manifesta visualmente hoje por acidente (o `className` passado no consumidor vence por `twMerge`, não porque o componente esteja certo). Tratado como extensão de KF-001 (chamado KF-001-B), incluído no mesmo esforço de correção por ser 1 arquivo a mais, sem custo adicional relevante.
2. **A correção de `button.tsx` sozinha, como planejada originalmente, não resolveria o bug no ar**: o seletor `html:not(.dark) main [class*="bg-["]...` (`index.css:352-358`) e `html:not(.dark) main button:not([type="submit"])...`/`.flex button:not(...)` (`:375-386`) continuam vencendo qualquer classe nova que `button.tsx` venha a usar, onde aplicáveis. Adicionada a FR-010 e a task T024 (exceção aditiva no CSS, sem remover nenhuma regra existente).

**CORREÇÃO de precisão (5ª verificação, 2026-08-26)**: a frase "todo Button dentro de main perde fundo e vira cinza genérico" não é tecnicamente exata — verificado por `grep -rn "<main" apps/web/src` que **`<main>` só existe em 4 lugares no app inteiro**: `AppLayout.tsx` (usado por `MetasPage.tsx`), `ConectarMetaPage.tsx` (tem `<main>` próprio), `SelecionarAtivosPage.tsx` (fora do escopo desta spec) e `AdminShell.tsx` (sempre escuro via `ForceDarkMode`, irrelevante). `AuthenticatedShell.tsx` — o layout que envolve a maioria das telas autenticadas, incluindo 7 dos 9 consumidores de `Button` — **não tem `<main>`**, só um `<div className="flex min-h-screen ...">`. Ou seja, o seletor `main [class*="bg-["]...` (que força fundo branco) só bate de fato em **2 dos 9 consumidores** (`MetasPage.tsx` via `AppLayout`, `ConectarMetaPage.tsx`); nos outros 7, esse seletor específico é efetivamente inerte hoje (não hoje, mas seria uma dependência real assim que qualquer um deles ganhasse um `<main>` no futuro — por isso o T024 continua protegendo todos, não só os 2 afetados agora).

O que **realmente** acontece hoje, por variante, calculado precisamente (o `.flex button:not(...)` bate em todos os 9 consumidores, via o `.flex` do `AuthenticatedShell`/wrappers locais; o `[class*="bg-[#1E88A8]"]` — sem restrição de ancestral — bate em qualquer lugar):
- `default` (`bg-[#1A1B17] text-[#ECEDEF] border-[#262824]`): fundo **não** é tocado fora de `<main>` (fica escuro, `#1A1B17`) + texto forçado para cinza `#475569` pela regra `.flex button` — combinação ruim (fundo quase-preto com texto cinza médio, contraste baixo), não "cinza genérico".
- `primary` (`bg-[#1E88A8] text-[#0C0D0A]`): `bg-[#1E88A8]` é pego pela regra global `[class*="bg-[#1E88A8]"]:not(.gradient-teal)` (`:391-398`, sem exigir `main`/`.flex`), que força `background-color:#1e88a8;color:#fff` — mantém o fundo petróleo e **troca** o texto de `#0C0D0A` (intenção do componente) para branco. Resultado hoje: acidentalmente parece OK (petróleo + branco).
- `outline` (`border-[#1E88A8] text-[#1E88A8]`, sem fundo): `.flex button:not(...)` força borda cinza-clara e texto cinza — perde a identidade petróleo, vira botão neutro cinza.
- `ghost` (`text-[#9BA1A6]`): mesma regra força texto para `#475569`, próximo do original — diferença pequena, quase imperceptível.
- `destructive` (`bg-[#E5534B] text-white`): fundo não é tocado (hex não bate em nenhuma regra global) fora de `<main>`, mas texto é forçado para cinza `#475569` — vermelho com texto cinza, combinação ruim e óbvia.
- `spark` (`bg-[#F97316] text-white`): mesmo padrão de `destructive` — fundo laranja mantido, texto forçado cinza. Visualmente quebrado e chamativo (não "sumiu", ficou feio).
- `soft` (`bg-[#1E88A8]/10 text-[#1E88A8] border-[#1E88A8]/20`): a classe `bg-[#1E88A8]/10` também contém a substring `bg-[#1E88A8]`, então bate na MESMA regra global do `primary` — vira fundo petróleo **sólido** (não mais o tom suave de 10%) com texto branco forçado. Fica visualmente idêntico ao `primary`, perdendo o propósito de "ação secundária discreta".

O T024 continua sendo a correção certa e necessária (protege contra o estado atual E contra qualquer consumidor futuro que ganhe `<main>`), mas a descrição acima é a real, não a generalização anterior.

**VERIFICAÇÃO REFORÇADA em 2026-08-26 (build real + teste empírico), pedida pelo usuário antes de autorizar execução**: o mecanismo exato foi confirmado — e revisado — com evidência real, não só leitura:
- Rodado `vite build` real do app e inspecionado o CSS compilado (`dist/assets/index-*.css`, 147KB). Confirmado por análise programática de profundidade de chaves: **o bloco `html:not(.dark)` está genuinamente fora de qualquer `@layer`** (profundidade de camada 0), enquanto **todo utilitário do Tailwind — incluindo classes com valor arbitrário como `bg-[#1E88A8]` — é gerado dentro de `@layer utilities`** (confirmado, `@layer utilities` abre no byte 13070, o bloco genérico começa no byte 133857). Isso importa porque, pela especificação de CSS Cascade Layers, a prioridade entre declarações `!important` se INVERTE em relação a declarações normais: **uma regra `!important` dentro de layer vence uma regra `!important` fora de layer**, independente de especificidade de seletor. Confirmado também que classes Tailwind com prefixo `!` (ex. `.\!mt-6`, já usado em `RegisterFormPage.tsx`) compilam para `!important` dentro de `@layer utilities`.
- Isso sugeria, à primeira vista, uma correção mais simples que a proposta original: em vez de mexer no `index.css`, bastaria usar classes `!`-prefixadas (`!bg-[...]`, `!text-[...]`) nas propriedades críticas de `button.tsx`/`card.tsx` — elas venceriam o bloco genérico só por estarem em layer, sem tocar CSS compartilhado.
- **Essa alternativa foi testada e REJEITADA**: rodei um teste real do `twMerge` (v3.6.0, o mesmo `cn()` usado no projeto — `lib/utils.ts`) simulando o cenário de `Subscription.tsx:126`, que **hoje já sobrescreve as cores do `Button` via `className`** (`variant="primary" className="bg-[#1E88A8] hover:bg-[#1E88A8]/80 text-white"`). Resultado: quando a classe base é `!important` e a do consumidor não, o `twMerge` **não remove o conflito** — as duas classes coexistem no `className` final, e a base `!important` vence, silenciando a customização do consumidor sem erro nenhum. Confirmado também que, se a base for `!important`, o consumidor teria que aprender a sempre usar `!` também nas suas próprias sobrescritas — reintroduzindo exatamente o tipo de convenção frágil e fácil de esquecer que esta spec existe para eliminar.
- **Conclusão final, confirmada**: a abordagem original do T024 (exceção aditiva por marker class nos seletores do bloco `html:not(.dark)`, SEM tornar as classes de `button.tsx`/`card.tsx` `!important`) é a correta. Ela preserva o mecanismo de customização via `className`/`twMerge` que `Subscription.tsx` já usa, e tem precedente direto no próprio código: `index.css:375` já usa exatamente esse padrão (`:not(.ady-calendar-shell button)`) para blindar os botões do calendário do mesmo bloco genérico — a marker class de `button.tsx`/`card.tsx` segue a mesma convenção já estabelecida, não inventa uma nova.

**Achados descartados por não terem impacto real (documentados para não serem re-investigados à toa)**:
- `apps/web/src/components/ui/input.tsx`, `select.tsx` — falso alarme, já usam tokens semânticos corretos. Único bug real, pequeno e não relacionado: `disabled:bg-gray-50` hardcoded em ambos (campo desabilitado fica cinza claro mesmo no escuro) — baixa prioridade, não entra nesta fase, registrado como KF-004.
- `apps/web/src/components/ui/dropdown-menu.tsx`, `form.tsx` — também theme-unaware, mas código morto (zero consumidores) — sem ação necessária; se algum dia forem usados, precisam do mesmo tratamento de `button.tsx`/`card.tsx`.
- `apps/web/src/components/FuryLiveFeed.tsx` — código morto (mesmo padrão de `AuthLayout.tsx`), confirmado sem nenhum import ativo (revalidado independentemente em 2026-08-26 — só aparece em `components/index.ts`, nenhuma página renderiza). Não precisa de correção de tema, mas é candidato à mesma limpeza de código morto do `AuthLayout.tsx` (fora do escopo funcional desta spec, mas pode ser incluído na mesma leva de remoção por conveniência).
- **KF-005 (achado menor, fora de escopo)**: `apps/web/src/lib/constants.ts` exporta `FURY_COLORS = { primary: '#E8631A', ... }`, usado como cor padrão de fallback em `TenantDetailPage.tsx`, `BrandKitPage.tsx` e `LandingPage.tsx` (brand kit de tenant, quando o tenant não tem cor customizada). É laranja Fury, não a paleta ady — resíduo de rebrand, mas é um valor de **dado/configuração**, não um bug de tema (não relacionado a claro/escuro). Fora do escopo desta spec; candidato a spec 013 ou a uma correção pontual separada, se o usuário confirmar que o fallback deveria ser a paleta ady.

## Escopo

### Dentro do escopo desta spec

- `apps/web/src/index.css:322-462` (bloco `html:not(.dark)`) — decisão de arquitetura + rollout de remoção/redução, não mudança de design system.
- `apps/web/src/pages/billing/AssinaturaVencida.tsx` — tematização completa (claro + escuro).
- `apps/web/src/pages/onboarding/MetaAuthorizePage.tsx` — troca de `!text-[#ECEDEF]` por `text-admin-text`.
- `apps/web/src/pages/NotFoundPage.tsx` — atualização de conteúdo de marca (FURY → ady).
- `apps/web/src/components/AuthLayout.tsx` — remoção (código morto).
- **`apps/web/src/components/auth/GoogleLoginButton.tsx:46` — achado da 4ª verificação (2026-08-26): diagnosticado desde o início da investigação (era o primeiro bug reportado pelo usuário) e mencionado em `plan.md`, mas nunca tinha virado task formal — corrigido agora.** O hover customizado (`hover:border-[#1E88A8]/50 hover:bg-white`) é sobrescrito pela mesma regra de `index.css:375-386` que afeta `Button.tsx`. Resolvido reutilizando a marker class `.ady-btn` já criada para `Button.tsx` (mesmo mecanismo, sem CSS adicional).
- Opacidade do grid de fundo em telas de auth (`opacity-[0.03]` no claro) — decisão objetiva de valor final.
- Auditoria (não implementação) do raio de impacto do bloco CSS genérico sobre os 26 arquivos que usam `bg-gray-*`/`bg-zinc`/`bg-slate`/`bg-neutral`/`bg-stone`, para informar o rollout.
- **`apps/web/src/components/ui/button.tsx` E `card.tsx` (KF-001 + KF-001-B) — trazidos para dentro do escopo por decisão do usuário em 2026-08-26, escopo ajustado após verificação profunda.** Tornar as 7 variantes de `Button` (`default`, `primary`, `outline`, `ghost`, `destructive`, `spark`, `soft`) e o `Card`/`CardTitle` theme-aware, preferencialmente usando os tokens semânticos já corretos em `index.css:13-102`/`:107-164` (`--color-*`/`--admin-*`) em vez de novos pares hex+`dark:`. Superfície de verificação real: **9 arquivos** consomem `<Button>`, **1 arquivo** consome `<Card>` (`MetasPage.tsx` — já contado nos 9). Nenhum se sobrepõe aos 4 já em escopo. **Adicional obrigatório (achado da verificação)**: `index.css:352-358` e `:375-386` precisam de uma exceção aditiva (marker class no `Button`/`Card`, adicionada aos `:not()` já existentes, no mesmo padrão de `.gradient-teal`/`.gradient-spark`) — sem isso, o bloco genérico continua vencendo por especificidade e a correção de `button.tsx` não teria efeito visual dentro de `<main>` (FR-010).
- **21 ocorrências confirmadas de `text-[#1E88A8]`-como-texto em 9 arquivos (KF-002, escopo corrigido em 2026-08-26)** — trazidas para dentro do escopo por decisão do usuário. Troca de valor (`text-[#1E88A8]` → `text-[#17708A]`) nos arquivos/linhas da tabela revisada acima. **Excluídos explicitamente** (falsos positivos — textos corretos como estão, dentro de cards sempre-escuros): `RoadmapPage.tsx`, `Plans.tsx`, `Subscription.tsx`, e as linhas 89/304/482/493/579 de `Dashboard.tsx`. A ocorrência de `AssinaturaVencida.tsx:67` é corrigida dentro da task de retematização completa do arquivo (T012), não isoladamente. Usos dentro de `button.tsx` (variantes `outline`/`soft`) são resolvidos via tokens semânticos como parte do item acima, não como swap superficial.

### Fora do escopo desta spec

- Qualquer refactor estrutural do design system além de `button.tsx` (outros componentes em `components/ui/*` podem ter o mesmo problema, mas não foram auditados — candidatos a spec 013 se aparecerem).
- Qualquer mudança em `/admin`, `/admin/login`, `ForceDarkMode.tsx`, ou em qualquer tela sempre-escura do superadmin.
- Investigação de link externo/quebrado para `/painel` — sem evidência de bug de código, fora do escopo até surgir um caso concreto.
- Implementação de código desta fase — esta spec e seu `plan.md`/`tasks.md` descrevem o trabalho; a execução é a próxima fase.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE renderizar `AssinaturaVencida.tsx` corretamente em ambos os temas (claro e escuro), sem depender do bloco CSS genérico de `index.css`.
- **FR-002**: `MetaAuthorizePage.tsx` DEVE seguir o tema do usuário (não travar em cores do tema escuro) em todos os elementos de texto.
- **FR-003**: `NotFoundPage.tsx` DEVE refletir a marca "ady" (símbolo, texto, comentários) sem nenhuma referência residual a "FURY".
- **FR-004**: `AuthLayout.tsx` DEVE ser removido do código-fonte após confirmação de que não há nenhum import ativo.
- **FR-005**: Nenhum elemento de TEXTO (não gráfico/ícone) sobre fundo claro DEVE usar `#1E88A8` como `color` — DEVE usar `#17708A` ou um token semântico equivalente, nos arquivos em escopo.
- **FR-006**: O bloco `html:not(.dark)` em `index.css` DEVE ser reduzido ou removido de forma incremental e verificada, nunca em uma única mudança sem checagem visual, dado que 26+ arquivos fora do escopo desta investigação dependem dele hoje para aparência correta em modo claro.
- **FR-007**: A opacidade do grid de fundo (`radial-gradient(#1E88A8 ...)`) nas telas de auth DEVE ter um valor final decidido objetivamente (critério de contraste/visibilidade), não arbitrário, e aplicado de forma consistente com o padrão `dark:opacity-[0.05]` já usado no escuro.
- **FR-008**: `apps/web/src/components/ui/button.tsx` E `card.tsx` DEVEM renderizar corretamente (contraste AA, cores da paleta certa) em ambos os temas, preferencialmente consumindo os tokens semânticos de `index.css` em vez de hardcode.
- **FR-009**: Nenhum uso de `text-[#1E88A8]` como cor de texto real (não ícone/borda/fundo) DEVE permanecer nos 9 arquivos listados na tabela revisada de KF-002 sobre fundo claro — DEVE usar `#17708A` ou token equivalente. Os textos dentro de cards sempre-escuros (`RoadmapPage.tsx`, `Plans.tsx`, `Subscription.tsx`, e as ocorrências de `Dashboard.tsx` fora do `HeroStrip`) NÃO DEVEM ser alterados — continuam corretos com `#1E88A8`.
- **FR-010** (adicionada em 2026-08-26): O bloco `html:not(.dark)` de `index.css` DEVE receber uma exceção aditiva (marker class, sem remover nenhuma regra existente) para que `Button`/`Card` corrigidos não continuem sendo sobrescritos pelos seletores `main [class*="bg-["]` (`:352-358`) e `main button:not([type="submit"])` (`:375-386`) — sem essa exceção, a correção de FR-008 não tem efeito visual quando o componente está dentro de `<main>`.

### Key Findings (rastreados — status atualizado em 2026-08-26)

- **KF-001**: `Button.tsx` (design system) não é theme-aware — causa raiz do bloco CSS genérico. **Decisão do usuário (2026-08-26): trazido para dentro do escopo desta fase** (ver FR-008), após levantamento mostrar que a superfície real de verificação é 9 arquivos, nenhum sobreposto às 4 correções já planejadas.
- **KF-002**: originalmente 25 ocorrências de `text-[#1E88A8]` como cor de texto real (não ícone) em 12 arquivos, fora do escopo original de 4 arquivos — **contagem corrigida na 3ª verificação para 21 ocorrências em 9 arquivos** (8 falsos positivos removidos, ver tabela "REVISADA" mais abaixo neste documento), violando a regra de contraste do guia de marca. **Decisão do usuário (2026-08-26): trazido para dentro do escopo desta fase** (ver FR-009), por ser troca de valor mecânica e isolada por arquivo, sem interação com CSS compartilhado.
- **KF-003**: Rota `/painel` sem evidência de bug de código — não vira FR até surgir um caso concreto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhuma tela de auth, billing/`AssinaturaVencida` ou onboarding usa cor hardcoded fora das variáveis de tema (`--color-*`/`--admin-*`) OU tem par explícito `classe-clara dark:classe-escura` para toda cor visível.
- **SC-002**: Contraste WCAG AA (≥ 4.5:1 texto normal, ≥ 3:1 texto grande/gráfico) respeitado em 100% do texto visível sobre fundo claro nos arquivos em escopo, verificado via `mcp__plugin_accesslint_accesslint__audit_live` (ou skill `accesslint:accessibility-scan`) nas rotas: `/login`, `/cadastro/formulario`, `/forgot-password`, `/reset-password`, `/onboarding/meta-authorize`, `/assinatura-vencida`, rota 404.
- **SC-003**: Zero seletores no bloco `html:not(.dark)` de `index.css` que seja genérico o bastante para mirar em tag solta (`span`, `p`, `h1`-`h4`) ou família de utilitário Tailwind (`bg-gray-*`, `bg-zinc`, `bg-slate`) sem escopo — cada regra remanescente deve ser específica (classe própria, ex. `.auth-card`) ou ter sido comprovada segura via auditoria de raio de impacto.
- **SC-004**: `grep -r AuthLayout apps/web/src` retorna zero resultados após remoção.
- **SC-005**: `grep -r "FURY" apps/web/src/pages/NotFoundPage.tsx` retorna zero resultados (case-insensitive).
- **SC-006**: Cada uma das 7 telas listadas em SC-002 testada visualmente nos dois temas (claro/escuro), com captura ou confirmação registrada em `tasks.md`.
- **SC-007**: As 7 variantes de `Button.tsx` e o `Card.tsx` renderizam corretamente (paleta certa, contraste AA) nos dois temas, verificado nos 9 arquivos consumidores listados no Escopo, **incluindo quando renderizados dentro de `<main>`** (valida FR-010, não só a cor do componente isolado).
- **SC-008**: `grep -rn 'text-\[#1E88A8\]' apps/web/src` não retorna nenhuma ocorrência como cor de texto real fora de: (a) rotas sempre-escuras (`/admin/*`), (b) os cards hardcoded-sempre-escuros explicitamente excluídos em FR-009 (`RoadmapPage.tsx`, `Plans.tsx`, `Subscription.tsx`, `Dashboard.tsx` fora do `HeroStrip`).

## KF-006 (achado grave, 2026-08-26) — sinalização de status por cor está quebrada em modo claro, não é só contraste

Terceira rodada de verificação (pedida pelo usuário, "absoluta certeza") checou tag-por-tag cada ocorrência que T030 ia editar. Achado: várias das ocorrências de KF-002 são `<span>` ou `<button>` sem exclusão — ou seja, **já estão sendo repintadas para `#475569` (cinza) pelo bloco genérico hoje**, independente do valor de cor no código-fonte. Trocar o valor (`#1E88A8`→`#17708A`) nesses casos é correto para a higiene do código (e necessário para quando o bloco genérico for removido, spec 013), mas **não muda nada visualmente agora** — o cinza forçado já está lá por cima.

**O caso grave**: em `apps/web/src/pages/dashboard/Metas.tsx`, as 4 ocorrências condicionais são todas `<span>`:
- `:79` — `isGood ? 'text-[#1E88A8]' : 'text-[#da3633]'` (petróleo=bom, vermelho=ruim)
- `:244` — `roas>=2 ? 'text-[#1E88A8]' : 'text-[#da3633]'`
- `:277` — `text-[#1E88A8]` fixo (dias restantes)
- `:316` — `highlight ? 'text-[#1E88A8]' : 'text-slate-900 dark:text-[#ECEDEF]'`

Como nenhum desses `<span>` tem `.gradient-teal`/`.gradient-spark`/`.bg-accent`, todos batem no seletor `span:not(...):not(...):not(...):not(...) { color: #475569 !important; }` (`index.css:448`) em modo claro. **Resultado real, hoje, em produção**: os dois ramos condicionais (`isGood`/`roas>=2`/`highlight` true ou false) renderizam com a MESMA cor cinza em modo claro — o usuário não tem nenhum sinal visual de "ROAS bom" vs "ROAS ruim", ou de linha de meta em destaque vs normal. Isso é uma perda de funcionalidade de status, não um problema de contraste — é mais grave que o resto do KF-002.

Também confirmado: 2 botões "Reenviar código" (`ResetPasswordPage.tsx:290`, `RegisterFormPage.tsx:186`, `type="button"`, dentro de um ancestral `.flex`) são igualmente mascarados pela regra `.flex button:not([type="submit"])... { color: #475569 !important; }` — hoje sempre cinza, nunca petróleo, independente do código.

**Não afetado** (fix tem efeito visual real, sem mascaramento): todos os `<Link>`/`<a>` da lista (não são alvo de nenhuma regra do bloco), e `ConfiguracoesTabsNav.tsx:31,32`, que já usa o prefixo `!` do Tailwind (`!text-[#1E88A8]`) — por já ser `!important` dentro de `@layer utilities`, escapa do bloco genérico (mesmo mecanismo de cascade layers verificado para o T024). **Atenção na implementação**: preservar o `!` ao trocar para `!text-[#17708A]`, não perder o prefixo.

**Decisão necessária do usuário**: para os casos mascarados (as 4 conditionals de `Metas.tsx` + os 2 botões "Reenviar código"), a troca de valor sozinha (T030) não resolve o problema real. Duas opções:
1. **Só trocar o valor agora** (T030 como está) — corrige a higiene do código, mas o bug de sinalização visual em `Metas.tsx` continua até o bloco genérico ser tratado (spec 013). Documentado, não resolvido.
2. **Aplicar a mesma técnica de escape do T024/T013** (marker class + extensão do `:not()` no bloco) nesses 6 pontos específicos — resolve de verdade agora, mesmo custo baixo (mesma técnica já usada em 2 outros lugares desta spec), mas expande o escopo desta fase.

**Decisão do usuário (2026-08-26)**: documentar e adiar. T030 corrige o valor no código (higiene), mas o bug funcional de sinalização de status em `Metas.tsx` (modo claro) **continua existindo** até uma spec futura (013) tratar o bloco genérico ou aplicar a técnica de escape. Não é um esquecimento — é uma decisão consciente registrada aqui.

## KF-013 (achado da execução real, 2026-08-26) — `ConectarMetaPage.tsx` tinha o mesmo bug do `MetaAuthorizePage.tsx` (T010), nunca corrigido

Relatado pelo usuário: `/onboarding/conectar-meta` com "letras brancas" no modo claro, escuro correto. Causa idêntica ao T010 original: `!text-[#ECEDEF]` hardcoded (prefixo `!` do Tailwind, sempre a cor de texto do modo escuro) em 3 lugares — o "ady" do cabeçalho (linha 105) e os dois títulos `<h1>` dos dois passos do fluxo (linhas 128, 151). Essa página nunca esteve na lista original de 4 telas investigadas (a spec só mapeou `MetaAuthorizePage.tsx`, não seu vizinho `ConectarMetaPage.tsx`, ambas telas de onboarding do fluxo Meta). **Corrigido**: as 3 ocorrências trocadas por `text-admin-text` (mesma técnica do T010). Reauditado via accesslint — zero violações.

## KF-012 (achado da execução real, 2026-08-26) — regra "forçar fundo claro" engolia o overlay do Radix Dialog

Relatado pelo usuário: no modo claro, o modal "Criar nova campanha" (`CampaignWizard.tsx`, usa `Dialog`/`DialogContent` de `components/ui/dialog.tsx`) perdia o fundo escurecido atrás dele. Causa: `index.css:503-504` (`html:not(.dark) body > div, html:not(.dark) #root > div { background-color: #f1f5f9 !important; }`), comentada como "forçar fundo claro nas telas de autenticação e admin", na prática bate em **qualquer** `div` filha direta de `body`/`#root` — incluindo o wrapper que o Radix `DialogPortal` cria para renderizar o modal fora da árvore normal da página (técnica de portal). Esse wrapper ficava pintado de opaco, interferindo no overlay semi-transparente (`bg-black/50`) que deveria escurecer o fundo.

**Corrigido**: seletor restrito com `:not(:has([role="dialog"]))` — não pinta o wrapper se ele contiver um diálogo Radix (que sempre carrega `role="dialog"` por padrão). Regra volta a fazer só o que o comentário diz que deveria fazer, sem efeito colateral em portais de modal. Qualquer outro Radix Dialog do app (não só `CampaignWizard`) se beneficia da mesma correção, já que é a mesma regra genérica.

## KF-011 (achado da execução real, 2026-08-26) — o mesmo bloco genérico quebra forma/cor de QUALQUER elemento decorativo com `bg-[#hex]`, não só Button/Card

Achado ao investigar um relato do usuário: no Dashboard, o círculo de porcentagem (`.icon-meta-circle`) ficava quadrado no modo claro. Causa raiz: `Dashboard.tsx` usa `AppLayout` **internamente** (não só via rota), então está dentro de `<main>` — e a 5ª verificação tinha mapeado só 4 arquivos com `<main>` porque só buscou a tag literal, não quem usa `AppLayout` por dentro. **Correção: 18 páginas usam `AppLayout` internamente** (`Plans`, `Subscription`, `Dashboard`, `Metas`, `CreativeStudio`, `GeradorCopy`, `GeradorImagem`, `RoadmapPage`, `Configuracoes`, `Integracoes`, `MinhasRegras`, `Campanhas`, `OrcamentoSmart`, `PlanejadorPage`, `CalendarioPage`, `EstudioHome`, `BrandKitPage`, `GoogleMeuNegocioPage`, `ComponentsDemo`) — praticamente todo o app autenticado está dentro de `<main>`, não só os 4 originalmente mapeados.

Isso significa que o seletor `main [class*="bg-["]...{ background-color:#fff; border:...; border-radius:1rem !important }` (`index.css:353-365`) atinge qualquer elemento customizado com classe `bg-[#hex]` nessas 18 páginas, a menos que explicitamente excluído — forçando fundo branco, borda cinza e cantos de 1rem em cima de qualquer forma/cor que o elemento tivesse (círculos viram quadrados arredondados, badges coloridos viram brancos).

**Corrigido em `Dashboard.tsx`** (3 elementos, achados na área "hero" mais visível): `.icon-meta-circle` (já tinha uma correção parcial, só de forma, que perdia a briga de especificidade — agora resolvido de vez), o badge de status (`cfg.label`), e o banner `MetaBanner` inteiro (que tinha um bug mais grave: texto hardcoded quase-branco `text-[#ECEDEF]`/`text-[#9A9D96]` sobre um fundo que a regra genérica forçava para branco — texto praticamente invisível). Introduzida marker class genérica `.ady-decor` (mesmo espírito de `.ady-btn`/`.ady-card`) — reutilizável para qualquer elemento decorativo futuro, em vez de continuar o padrão de remendo-por-classe-única já presente no código (`.icon-meta-circle`, `.progress-fill-bar`, `.filter-pill-active`, `.quick-create-btn`, `.chip-active` — 5 remendos pontuais preexistentes para essa mesma causa raiz).

**Não corrigido — mesmo padrão provavelmente presente em**: `Plans.tsx`, `Subscription.tsx`, `CreativeStudio.tsx`, `GeradorCopy.tsx`, `GeradorImagem.tsx`, `RoadmapPage.tsx` (dezenas de classes `bg-[#hex]` sem `dark:`/marker, achadas por grep — não teve tempo de classificar quais são portais de Dialog, que escapam de `<main>` e ficam protegidos, e quais estão em fluxo normal de página, genuinamente afetadas). Fora do resto do próprio `Dashboard.tsx`: pontos menores não corrigidos (dots de legenda, skeleton loaders `animate-pulse bg-[#1F211D]`, badge pequeno linha 521) — impacto visual menor, mas mesma causa.

## KF-015 (achados da 1ª rodada de teste com navegador real controlado por CDP, 2026-08-26)

Depois de tentar verificar via print manual do usuário (lento, sujeito a cache do navegador), montei um driver CDP direto (sem Playwright — Node 22 + `WebSocket` nativo + o Chrome que o accesslint já mantém rodando em `localhost:9222`) para logar de verdade (usuário demo `dev.fashion@fury.test`, criado via `packages/db/src/create-demo-user.ts`) e navegar pelas telas autenticadas, alternando tema via `localStorage.setItem('fury-theme', ...)` (confirmado equivalente ao clique real no toggle — ver correção abaixo) e tirando screenshot real via `Page.captureScreenshot`.

**Correção de um achado anterior**: eu tinha concluído (grep por `toggleTheme|setTheme|selectTheme`) que não existe nenhum controle de UI para trocar de tema. **Errado** — existe, em `Configurações → Aparência` (`Configuracoes.tsx`, usa `useTheme()`/`setDark`), meu grep só não cobriu esses nomes. Testado o clique real no botão "Escuro" — funciona corretamente, mesmo mecanismo (`localStorage['fury-theme']` + classe `.dark` no `<html>`).

**Bugs novos encontrados e corrigidos**, todos por observação direta (não suposição):
- **`Plans.tsx:329`** — `title="Planos FURY"`, branding não trocado (achado tipo KF-007, mas fora dos módulos já mapeados). Corrigido para "Planos ady".
- **`Plans.tsx:264`** — a div do ícone de cada card de plano tinha DUAS classes de cor conflitantes na mesma string (`text-white` e `text-[#1E88A8]` juntas, sem `cn()` para resolver o conflito). `text-white` vencia nos dois temas — no escuro isso passava despercebido (branco sobre fundo escuro do círculo), no claro os ícones (raio/estrela/escudo) ficavam **completamente invisíveis** (branco sobre fundo quase-branco). Corrigido removendo `text-white`.
- **`components/EmptyState.tsx`** — componente compartilhado (usado em `Subscription.tsx` e outros lugares) **inteiramente hardcoded para modo claro**, nunca tematizado, e usando o laranja Fury antigo (`#E8631A`, `#FEF0E7`, `#C4521A` — diferente do `#CF6F03` da Faísca ady). O título (`text-[#1C1C1E]`, quase preto) ficava **invisível no modo escuro** (quase preto sobre fundo quase preto) — visto na tela de Assinatura, onde "Nenhuma fatura ainda" sumia, restando só a descrição (que por acaso usa um cinza médio com contraste suficiente nos dois temas). Corrigido: ícone padrão e botão de ação usando `var(--color-accent)`/`bg-accent` (Faísca ady, tokens já corretos), título/descrição usando `text-text-primary`/`text-text-secondary`.

**Telas confirmadas limpas nos dois temas** (visual real, não só ausência de erro): Dashboard (incluindo `.icon-meta-circle` — forma e cor corretas agora), Metas, Assinatura, Planos (depois da correção), Campanhas, Calendário, Estúdio, Configurações.

**Gradiente de fundo (`ConectarMetaPage`/`MetaAuthorizePage`) — confirmado resolvido**: depois de 8 rodadas às cegas sem conseguir ver o resultado, o print real mostrou que a versão final (opacidade 7%, alcance 70%, cobrindo a página inteira) já estava correta nos dois temas — brilho suave, proporcional, sem corte perceptível. As tentativas anteriores provavelmente pareciam "sem mudança" por cache do navegador, não por erro no CSS.

## KF-010 (achado da execução real, 2026-08-26) — 2 violações de contraste no `NotFoundPage.tsx`, achadas só ao rodar accesslint de verdade

Fora do que qualquer verificação por leitura estática tinha encontrado — só apareceu ao rodar `accesslint audit_live` contra o dev server real, depois de resolver dois problemas de ambiente pré-existentes e sem relação (`swagger-ui-express` faltando, `packages/db` com build desatualizado). Não é bug de claro/escuro — é o laranja da marca (`--color-accent`, `#CF6F03`) sem contraste suficiente em dois usos específicos de `NotFoundPage.tsx`: o botão "Voltar ao início" (`bg-accent text-white`, medido em 3.63:1, precisa 4.5:1) e o rodapé "ady" (`text-accent/60`, medido em 2.66:1). Corrigido: botão trocado para a classe `gradient-spark` já existente no `index.css` (usa `#B55F02` como âncora mais escura do degradê); rodapé trocado para `text-[#B55F02] dark:text-accent`. Reauditado — zero violações. Prova concreta de que verificação por leitura de código, por mais rigorosa, não substitui rodar a ferramenta contra o app real.

## KF-007 (achado grave, 6ª verificação, 2026-08-26) — rebrand FURY→ady nunca foi feito em dois módulos inteiros

Fora do escopo desta spec (não é bug de claro/escuro — é laranja Fury original, sem nenhuma correção de tema envolvida, igual nos dois modos), mas grande e importante demais para não registrar. Achado ao investigar por que `focus:ring-[#E8631A]` (laranja) apareceu em `dialog.tsx` (que, fora isso, já é corretamente tematizado com tokens).

`grep -rn "E8631A\|EA580C" apps/web/src` retorna **mais de 90 ocorrências** em ~25 arquivos. Concentração real:

- **`pages/estudio/*`** (módulo "Estúdio Criativo" inteiro): `CreativeStudio.tsx`, `GeradorImagem.tsx`, `GeradorCopy.tsx`, `components/CreativeWizard.tsx`, `components/CreativeResult.tsx`, `components/AdaptiveQuestions.tsx`, `components/CreativeFieldsForm.tsx` — dezenas de ocorrências (fundos de botão, bordas, focus rings, texto de destaque). Nunca rebrandeado.
- **`components/campaign-wizard/*`** (wizard de criação de campanha inteiro): `CampaignWizard.tsx` + todos os `steps/{Step1Objective,Step2Creative,Step3Audience,Step4Budget,Step5Review,InstagramPostsTab}.tsx` — mesma situação.
- **Design system compartilhado**: `components/ui/input.tsx`, `select.tsx`, `dialog.tsx` têm `focus:border-[#E8631A]`/`focus:ring-[#E8631A]` hardcoded — afeta o anel de foco de **todo input, select e botão de fechar de dialog do app inteiro** (alcance muito maior que os dois módulos acima, mesmo sendo só 1 propriedade CSS por arquivo).
- **`components/FuryRuleDialog.tsx`** — nome do arquivo ainda é "Fury".
- Ocorrências pontuais: `EmptyState.tsx`, `LoadingSpinner.tsx`, `LandingPage.tsx`, `ComponentsDemo.tsx`, `pages/configuracoes/BrandKitPage.tsx`, `pages/onboarding/SelecionarAtivosPage.tsx`.
- `lib/utils.ts:44` **e** `lib/constants.ts:7` — `FURY_COLORS = { primary: '#E8631A' }` duplicado em dois arquivos (KF-005, já citado, agora confirmado com a segunda ocorrência).

**Por que não entra nesta spec**: é um problema estrutural diferente (rebrand nunca aplicado) de um problema de tema (rebrand aplicado errado). Misturar as duas coisas nesta fase confundiria o escopo e o critério de aceite (esta spec mede "funciona nos dois temas", não "usa a marca certa"). **Recomendação**: spec própria, dedicada a completar o rebrand FURY→ady nesses módulos — provavelmente maior em volume de arquivos que a spec 012 inteira.

## KF-008 (achado, 7ª verificação, 2026-08-26) — `Button.tsx` variante `spark` usa a cor errada da marca, não é bug de tema

Ao fazer o mapeamento completo das 7 variantes contra os tokens reais (ver T020 em `tasks.md`), confirmado que `button.tsx` usa `bg-[#F97316]` na variante `spark` — esse é o laranja padrão do Tailwind (`orange-500`), **não** a "Faísca" oficial do guia de marca (`#CF6F03`, token `--color-accent`/`--spark`, usada consistentemente em `gradient-spark`, badges, e no resto do app). O botão `spark` nunca usou a cor certa, em nenhum tema — é um bug de valor de cor independente de claro/escuro, descoberto como efeito colateral de tentar tematizar o componente. Corrigido dentro do T020 (troca simples de valor, `#F97316` → `#CF6F03`), não precisa de spec própria por ser 1 linha.

Também confirmado no mesmo exercício: `destructive` usa `#E5534B`, diferente de `--color-error` (`#da3633`, usado no resto do app) — aqui a diferença pode ser intencional (tom próprio do botão) ou outro descuido; ao contrário do `spark`, não há uma "cor oficial de marca" documentada para vermelho de erro que decida isso sozinho — fica registrado como decisão a tomar durante a implementação (T020), não presumido.

## KF-009 (achado grave, 8ª verificação, 2026-08-26) — KF-002 tem uma falha de metodologia: a busca original nunca cobriu as classes de token

Toda a auditoria de KF-002 (spec.md/tasks.md) foi feita a partir de `grep -rn 'text-\[#1E88A8\]'` — sintaxe de valor arbitrário do Tailwind. Isso **nunca poderia encontrar** usos da mesma cor via classe de token (`text-brand`, `text-admin-petrol`) — que resolvem exatamente para `#1E88A8` (nenhum dos dois é theme-conditional, ver achado da 5ª/7ª verificação) e têm a **mesma violação de contraste** quando usados como cor de texto real sobre fundo claro.

`grep -rn '\btext-brand\b'` (excluindo `hover:`) retorna ocorrências em `Sidebar.tsx`, `CalendarView.tsx`, `GeneratingState.tsx`, `PainelCampanhas.tsx`, `ProfileStatusPanel.tsx`, `EstudioHome.tsx`, `IntegracoesContent.tsx`, `GoogleIntegrationCard.tsx`, `BusinessProfileForm.tsx`, `InsightsCampanha.tsx`, `Configuracoes.tsx`, `GoogleConnectionCard.tsx`, `ProfileLookupResult.tsx` — **mais de 40 ocorrências em 13+ arquivos**, nenhum deles no escopo atual de KF-002. `grep -rn '\btext-admin-petrol\b'` fora de `/admin`/`/superadmin` retorna mais 4 arquivos (`AdySymbol.tsx`, `MetasPage.tsx`, `ConectarMetaPage.tsx`, `PublicoContent.tsx`).

**Confirmado, exemplo concreto**: `Sidebar.tsx:86` — `isActive ? 'bg-sidebar-active text-brand font-semibold shadow-xs' : ...` — o **texto do item de navegação ativo**, renderizado em praticamente toda tela autenticada do app, usa `text-brand` (`#1E88A8`) sobre `bg-sidebar-active` (claro: `rgba(30,136,168,0.1)`, quase branco) — a mesma violação AA (3.49:1) do KF-002 original, só que na navegação principal do produto, não numa tela secundária.

**Não classificado nesta sessão** (a maioria das ~44 ocorrências é ícone — `<Loader2 className="text-brand"/>`, `<Icon className="text-brand"/>` — que é uso gráfico correto, não viola nada; uma parte real é texto/badge/label, violação de verdade, ex. `Sidebar.tsx:86`, `ProfileStatusPanel.tsx:16,19,21` que são labels de status "Conectado"/"Verificado"/"Sincronizado"). Separar ícone de texto real nessas ~44 ocorrências, com o mesmo rigor usado no KF-002 original, é trabalho equivalente ou maior que o próprio T030 — não cabe fazer isso apressadamente agora.

**Recomendação**: tratar como extensão do mesmo problema de KF-002/KF-005 — candidato à mesma spec futura de correção de contraste, com a `Sidebar.tsx:86` como prioridade (visibilidade altíssima, toda tela autenticada). Não incluído na execução desta fase — o volume descoberto agora é grande demais para decidir com pressa; fica registrado para o usuário decidir quando.

## KF-016 (achado na execução real, continuação 2026-08-26) — regra genérica de fundo/texto só excluía o elemento com `.ady-decor`, não os descendentes dele

O mecanismo de escape criado no T024 (`.ady-decor`/`.ady-btn`/`.ady-card`) funcionava corretamente para o elemento que **recebe** a classe diretamente, mas as regras genéricas usavam `:not(.ady-decor)` (só exclui o próprio elemento) em vez de `:not(.ady-decor *)` (exclui também qualquer descendente). Resultado: um `<section className="ady-decor ...">` escapava do fundo forçado, mas todo `<h1>`/`<h2>`/`<h3>`/`<p>`/`<span>`/`<label>` **dentro** dele continuava sendo pego pelas regras de tipografia genérica (`index.css` ~440-452) e repintado para as cores de modo claro — inclusive quando o card em volta permanecia escuro de propósito. Efeito visual: título/texto quase invisível dentro de cards que deveriam ficar sempre escuros (`Dashboard.tsx`, blocos `SURFACE`).

**Corrigido**: todas as regras genéricas relevantes (`h1`-`h4`, `p`/`span`/`label`/`.text-muted-foreground`, e o bloco de `main [class*="bg-["]`/`bg-zinc`/`bg-slate`/etc.) passaram a usar `:not(.ady-decor *)` além de `:not(.ady-decor)`, cobrindo o elemento em si **e** qualquer descendente. Mesma técnica aplicada por consistência ao seletor duplicado de `h1`/`h2`/`h3` perto do fim do arquivo (ver KF-017).

## KF-017 (achado na execução real, continuação 2026-08-26) — regra duplicada de `h1`/`h2`/`h3` no fim de `index.css`, sem a exclusão `.gradient-teal` que a regra original tem

Existem **duas** regras separadas forçando cor de `h1`/`h2`/`h3` no modo claro: a original, dentro do bloco `html:not(.dark) { ... }` (`p`/`h1`-`h4` genéricos, linha ~440), que já exclui corretamente `.gradient-teal h1` (o banner degradê do Planejador IA); e uma **segunda cópia**, solta perto do fim do arquivo (`index.css:510-514`, resquício de um fix anterior desta mesma spec para o bug do Radix Dialog/KF-012), que nunca teve essa exclusão. Como CSS aplica todas as regras que casam (não só a "primeira"), a segunda regra vencia por ordem de origem e pintava o `<h1>` do banner "Seu mês de conteúdo, planejado em um clique." (`pages/planejador/components/IdleStatus.tsx:36`) de quase-preto sobre o fundo teal escuro — praticamente ilegível. **Corrigido**: acrescentado `:not(.gradient-teal *)` (e `:not(.ady-decor *)`, mesmo raciocínio do KF-016) aos três seletores da regra duplicada.

## KF-018 (achado na execução real, continuação 2026-08-26) — bug de stacking context: fundo forçado do `<main>` genérico "engolia" gradientes decorativos posicionados atrás dele

`index.css` força `background-color: #EBEEF0 !important` em qualquer `<main>` no modo claro (regra de nível bem alto, `body`/`#root`/`.bg-background`/`main`, sem nenhuma exceção até este achado). Em `ConectarMetaPage.tsx`, a estrutura é: uma `<div>` decorativa (`aria-hidden`, `absolute inset-0`, gradiente radial de fundo, sem `z-index` explícito → participa do empilhamento em `z-index:auto`) é irmã de `<header>` e `<main>`, ambos com `z-10` explícito. Por regra de CSS, um irmão posicionado com `z-index` explícito sempre pinta por cima de um irmão em `z-index:auto`, **independente da ordem no DOM**. No modo escuro isso nunca apareceu como bug porque `<main>` não tinha fundo próprio (transparente, o gradiente atrás aparecia normalmente); no modo claro, o fundo opaco forçado do `<main>` cobria a metade inferior do gradiente, criando um corte/faixa visível bem na altura do cabeçalho — o mesmo bug que gerou várias rodadas de ajuste (errado) de opacidade/posição do gradiente antes deste diagnóstico. **Diagnóstico e correção fornecidos pelo usuário** durante a sessão (análise de stacking context correta, verificada no código antes de aplicar): regra alterada para `main:not(.ady-decor)`, e `<main>` de `ConectarMetaPage.tsx` marcado com `ady-decor` (reaproveitando a mesma convenção do KF-016, já que este `<main>` não define fundo próprio nenhum — "gerencia o próprio fundo" ao ficar transparente de propósito). Confirmado via screenshot real (CDP) nos dois temas: gradiente contínuo, sem corte.

## KF-019 (achado na execução real, continuação 2026-08-26) — Faísca (`#CF6F03`) com texto branco reprova AA em qualquer botão/badge sólido, nos dois temas

Independente de KF-008 (cor errada de marca, já corrigido), a cor **certa** da Faísca (`#CF6F03`) usada como fundo sólido com texto branco por cima mede **3.54:1** — abaixo do mínimo de 4.5:1 para texto normal, em qualquer tema (não é bug de claro vs. escuro, é a cor em si contra branco). Achado ao investigar por que o botão "Novo Post/Campanha" do Calendário (`variant="spark"` do `Button`) tinha sido "corrigido" localmente com uma sobrescrita de `text-slate-900` no claro — a sobrescrita era uma tentativa (errada) de contornar esse problema de contraste, não um bug de tema. Confirmado o mesmo padrão em `--gradient-spark` (`index.css`, usado no botão "Gerar planejamento" do Planejador IA) e em dois badges de `RoadmapPage.tsx`. **Corrigido na causa**: `variant="spark"` e `--gradient-spark` escurecidos para `#B55F02`/`#9A4F02` (tons já estabelecidos em correções anteriores desta spec para o mesmo problema em texto colorido), mantendo a identidade Faísca mas passando AA (4.56:1 e 6.01:1). A sobrescrita indevida em `CalendarView.tsx` foi removida.

## KF-020 (achado na execução real, continuação 2026-08-26) — padrão sistêmico: `bg-brand`/`bg-[#1E88A8]` sólido com texto branco em repouso reprova AA em ~15 botões pela aplicação

`--color-brand` (`#1E88A8`) é um valor único, não theme-conditional (mesmo achado de KF-009, mas agora aplicado ao **fundo** de botão, não à cor de texto). Texto branco sobre `#1E88A8` mede **4.08:1**, abaixo do mínimo. O padrão apareceu repetido em botões primários de `Configuracoes.tsx`, `GoogleIntegrationCard.tsx` (×3), `IntegracoesContent.tsx` (×4), `Plans.tsx` (×3), `PeriodSelector.tsx`, e — mais grave — na própria variante `primary` do componente `Button.tsx` (`components/ui/button.tsx`), usada em botões de submit de **todas** as telas de autenticação (`LoginPage`, `RegisterPage`, `RegisterFormPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `ResetPasswordSuccessPage`) e em `AssinaturaVencida.tsx` — nesses casos o estado de `hover:` já usava corretamente `#17708A`, só o estado de repouso (o que a pessoa vê a maior parte do tempo) ficou com a cor errada. **Corrigido**: todos os pontos trocados para `#17708A` (branco sobre ele mede 5.64:1); hover reajustado para um tom ainda mais escuro (`#145E74`) onde fazia sentido manter feedback visual de hover.

## KF-021 (achado na execução real, continuação 2026-08-26, fora do escopo por decisão do usuário) — `/admin/login` não fica realmente em modo escuro forçado

Investigado a pedido do usuário (dúvida se o mesmo bug do KF-018 afetava `/admin/login`). Achado real, mas **diferente**: `ForceDarkMode.tsx` força `.dark` no `<html>` via `useEffect` ao montar `/admin/login`; mas `ThemeProvider.tsx` (mais acima na árvore de componentes, montado junto com o app inteiro) tem seu próprio `useEffect` que sincroniza `.dark` com o Redux (`authSlice.theme`) — e como efeitos de componentes pai rodam depois dos efeitos dos filhos na montagem, o `ThemeProvider` desfaz a classe que o `ForceDarkMode` acabara de aplicar, sempre que o tema salvo do usuário for "claro". Confirmado ao vivo: com `localStorage` em `light`, `/admin/login` renderiza com fundo/inputs claros por cima do design (inline, sempre-escuro) da tela. **Não corrigido nesta sessão** — usuário confirmou que `/admin/login` é uma tela sempre-escura por design, sem necessidade de modo claro; ficou fora do escopo desta spec, registrado aqui só para não perder o diagnóstico caso vire prioridade depois.

## Telas futuras — o que esta spec garante e o que não garante (respondendo pergunta do usuário, 2026-08-26)

**Garantido por esta spec**: qualquer tela nova que use `<Button>`, `<Card>`, `<Input>`, `<Select>` (o design system em `components/ui/*`) ou os tokens semânticos já corretos de `index.css` (`bg-surface`, `text-text-primary`, `border-border`, `bg-admin-*`, etc.) herda a identidade ady correta nos dois temas automaticamente, sem o desenvolvedor precisar pensar em `dark:` manualmente — é exatamente o efeito de corrigir a causa raiz (KF-001) em vez de só os sintomas.

**NÃO garantido, e por quê**: o bloco `html:not(.dark)` de `index.css` **continua existindo** (decisão consciente desta fase, ver Abordagem C em `plan.md`). Uma tela nova que hardcode cor na mão em vez de usar o design system/tokens ainda pode colidir com esse bloco do mesmo jeito que os bugs desta spec aconteceram — não há nada impedindo isso estruturalmente, é só convenção. A garantia completa e definitiva ("qualquer coisa nova já nasce certa, mesmo hardcoded") só existe depois que o bloco for removido de vez (Abordagem A, spec 013, condicionada a KF-001 estar resolvido — o que esta spec faz — e aos 26 arquivos de `bg-gray-*`/`bg-zinc`/`bg-slate` auditados/corrigidos).

**Recomendação para reduzir esse risco sem abrir escopo maior agora**: nenhuma ação de código nesta fase, mas registrar como decisão consciente — se o time continuar criando telas novas com cor hardcoded em vez de usar o design system, o problema volta a aparecer independente desta spec.

- O usuário validará visualmente cada mudança antes de mergear (não há suíte de teste visual automatizada no frontend — 0% de cobertura conforme `CLAUDE.md`/QA state).
- A ferramenta `accesslint` (MCP `plugin:accesslint:accesslint`, `audit_live`) está disponível no ambiente de implementação para checagem objetiva de contraste, substituindo julgamento visual subjetivo.
- Nenhuma das 4 correções pontuais (`AssinaturaVencida`, `MetaAuthorizePage`, `NotFoundPage`, `AuthLayout`) depende de mudança de schema/backend.
- KF-001 e KF-002 agora fazem parte da execução desta fase (ver decisão de 2026-08-26 abaixo). O bloco CSS genérico (`index.css:322-462`) continua fora do escopo de remoção — corrigir `Button.tsx` reduz uma das dependências desse bloco, mas não elimina as demais (26 arquivos com `bg-gray-*`/`bg-zinc`/`bg-slate` não auditados continuam de fora).

## Clarifications

### Sessão 2026-08-26

- Q1 (KF-002 — incluir agora ou virar spec 013?): **Resolvida.** Usuário pediu explicação de impacto/necessidade antes de decidir. Levantamento mostrou risco baixo (troca de valor isolada por arquivo, sem CSS compartilhado) e necessidade real (viola regra do próprio guia de marca). Decisão: incluir nesta fase (ver FR-009, Escopo).
- Q2 (KF-001 — priorizar `Button.tsx` antes do resto?): **Resolvida.** Levantamento mostrou superfície real de 9 arquivos consumidores, nenhum sobreposto aos 4 já planejados, mudança contida a 1 arquivo. Decisão: incluir nesta fase (ver FR-008, Escopo), usando tokens semânticos em vez de hardcode.
- Q3: Rota `/painel` — se o usuário tiver a origem exata do link (e-mail, bookmark, landing externa), fornecer para virar task; sem isso, fica registrada como investigada e não reproduzida em código.

### Sessão 2026-08-26 (continuação — execução real pós-handoff)

- Q4 (blocos `SURFACE` do Painel, ver stopgap descrito em `tasks.md` Fase 9): inicialmente resolvidos com um stopgap (`ady-decor`, fundo sempre escuro nos dois temas) para não deixar texto invisível enquanto o resto da spec avançava. Usuário notou o resultado visual remendado (página clara com cards pretos) e perguntou diretamente o que tinha mudado — resposta dada com `git diff` real, não memória da conversa. **Resolvida**: usuário escolheu "tematizar de vez" em vez de manter o stopgap ou reverter. Os 6 blocos foram retematizados de verdade (par claro/escuro completo, replicando o padrão que `HeroStrip` já usava) — ver Fase 9 em `tasks.md`.
- Q5 (cards novos vão nascer corretos automaticamente?): **Resolvida.** A constante `SURFACE` (`Dashboard.tsx`) foi consolidada para ser autocontida (par `dark:`/claro embutido nela mesma, não repetido em cada uso) — qualquer card novo que usar `${SURFACE}` como base já nasce correto nos dois temas sem esforço extra. O conteúdo *dentro* do card (texto, ícones) continua exigindo os pares `dark:`/claro manuais de qualquer desenvolvimento normal em Tailwind — isso não é (e não tem como ser, sem uma reescrita maior do design system) totalmente automático.
