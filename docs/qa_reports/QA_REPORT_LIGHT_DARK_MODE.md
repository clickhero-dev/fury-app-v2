# Relatório QA — Problemas de Modo Claro / Escuro (Light/Dark Mode)

**Data:** 2026-09-23
**Escopo:** `apps/web` (frontend React 19 + Tailwind CSS v4 + Redux)
**Branch:** `chore/calendario-planejamento`
**Autor:** QA Agent (@qa)

---

## 1. Resumo Executivo

A aplicação tem **dois sistemas de tema concorrentes e mutuamente compensatórios**:

1. **Sistema de componentes**: classes Tailwind com variantes `dark:` e/ou tokens semânticos
   (`bg-surface`, `text-text-primary`, etc.).
2. **Sistema de "remendos" globais em `index.css`**: **77 declarações `!important`** com cores
   hex hardcoded que sobrescrevem os componentes tanto no modo claro (`html:not(.dark)`) quanto
   no escuro (`.dark`).

O resultado é frágil: componentes com cores hardcoded "escuras" só funcionam no modo claro porque
o `index.css` as "resgata" à força com `!important`. Qualquer componente que escape dos seletores
do CSS quebra em um dos modos. **Já existem dois exemplos reais de texto invisível:**

| Severidade | Onde | Situação |
|---|---|---|
| **Crítico** | `Dashboard.tsx:627-628` | Texto `#ECEDEF` (quase branco) fixado para seção do Instagram |
| **Crítico** | `CreativeStudio.tsx:271,279,284` | Texto `#101828` (quase preto) em superfície escura → invisível no dark mode |
| **Alto** | `index.css` | 77 `!important` + remapeamentos de cor — a "causa raiz" |
| **Alto** | `components/ui/input.tsx` / `select.tsx` | `disabled:bg-gray-50` vira cinza-claro no dark mode (seletor do CSS não casa) |
| **Médio** | Superadmin | Todo hardcoded escuro + força `.dark` via `ForceDarkMode` |
| **Médio** | `StatusBadge.tsx` | Badges `blue/yellow/red` não têm override no dark → badges claros no modo escuro |

**Números da varredura:**

- **752** ocorrências de cores hex hardcoded em `.tsx`/`.ts` (contando testes), em **76 dos 213
  arquivos-fonte** (~36% dos arquivos).
- **588** usos de cores arbitrárias do Tailwind (`bg-[#...]`, `text-[#...]`, `border-[#...]`).
- **29** estilos inline com `color:`/`backgroundColor:`.
- **350** usos da variante `dark:` (concentrados em poucos arquivos; a maioria do código não usa).
- **77** `!important` em `index.css` (569 linhas).
- **0** testes dedicados a `ThemeProvider`/`useTheme`/alternância de tema (2 testes tocam o assunto
  incidentalmente: `AuthenticatedShell.test.tsx`, `EmptyState.test.tsx`).

---

## 2. Arquitetura de Tema Atual (o que existe)

| Peça | Arquivo | Comportamento |
|---|---|---|
| Estado do tema | `apps/web/src/store/slices/authSlice.ts:28-46,168-170` | Redux `theme: 'light' | 'dark'`, persistido em `fury-theme` (fallbacks legados `theme`, `ady-theme`); inicialização lê `prefers-color-scheme` |
| Aplicação global | `apps/web/src/components/providers/ThemeProvider.tsx:17-29` | Adiciona classe `.dark` + `data-theme` + `colorScheme` no `<html>` |
| Hook | `apps/web/src/hooks/useTheme.ts` | `isDark`/`setDark` — seta Redux + localStorage |
| Variantes Tailwind | `apps/web/src/index.css:6` | `@custom-variant dark (&:where(.dark, .dark *))` |
| Tokens CSS | `apps/web/src/index.css:12-164` | `:root` (claro) e `.dark` (escuro): `--bg-*`, `--text-*`, `--border-*`, `--admin-*`, mapeados em `@theme` |
| Pré-aplicação | `apps/web/index.html` | Script inline adiciona `.dark` antes do bundle (evita flash) |
| FullCalendar | `apps/web/src/pages/planejador/components/CalendarView.css` | Uso **correto** de tokens (`--fc-*` ← `var(--color-*)`) |

**Ponto positivo:** a base de tokens (`index.css:12-164`) é bem estruturada e o `CalendarView.css`
é um exemplo de uso correto de tokens. **O problema não está nos tokens — está nos componentes que
não os usam e no CSS que os sobrescreve.**

---

## 3. Componentes Problemáticos (com arquivo e linha)

### 3.1 CRÍTICO — `index.css` como camada de "remendo" (causa raiz)

**Arquivo:** `apps/web/src/index.css` (569 linhas)

- **Linhas 353-365** — Força `main [class*="bg-["]`, `bg-zinc*`, `bg-slate*`, `bg-neutral*`,
  `bg-stone*`, `bg-black`, `bg-surface` e `form` a ficarem **brancos com borda + radius** no modo
  claro (`!important`). Qualquer página com fundo customizado dentro de `main` é achatada para
  "card branco".
- **Linhas 375-379** — Força `form input` para `#f8fafc`/`#e2e8f0`/`#0f172a` `!important`,
  ignorando a classe do componente.
- **Linhas 382-392** — Força botões secundários `border`/`color` `!important` com `#e2e8f0`/`#475569`.
- **Linhas 458-463, 565-568** — Força `h1-h4` para `#0f172a !important` no claro, **sobrescrevendo
  classes do componente** (ex.: o `text-[#ECEDEF]` do Dashboard só "funciona" no claro por causa
  desses resgates).
- **Linhas 478-483** — Força `p`, `span`, `label`, `.text-muted-foreground` para `#475569 !important`.
- **Linhas 244-258** — Remapeia `bg-[#E8631A]`, `bg-[#EA580C]`, `hover:bg-orange-*` e
  `border-[#E8631A]` para petróleo via `[class*="..."]` + `!important` — ou seja, o código usa a cor
  **errada** (laranja legado) e o CSS a conserta depois.
- **Linha 528** — `button.filter-pill-active.filter-pill-active.filter-pill-active` (classe repetida
  3×) para vencer especificidade — claro sintoma de guerra de CSS.
- **Linhas 1 e 207** — `@import "tailwindcss"` **duplicado**.

**Problema:** esta camada "conserta" os modos, mas:
1. Mata o encapsulamento — componentes não podem definir sua própria cor de fundo/borda.
2. Seletores não cobrem tudo (ex.: `disabled:bg-gray-50` não é `bg-gray-50`).
3. Gera inconsistência visual (todo `main` vira "card branco" mesmo quando o design pedia outra coisa).

### 3.2 CRÍTICO — `pages/dashboard/Dashboard.tsx`

**Arquivo:** `apps/web/src/pages/dashboard/Dashboard.tsx` (884 linhas, **76 cores hex**)

| Linha | Código | Problema |
|---|---|---|
| **809** | `text-[#ECEDEF]` no wrapper do dashboard | Cor de texto **escura** (quase branca) aplicada em modo claro. Só não fica invisível porque o `index.css` "resgata" com `!important`. Contraste medido: **1.01:1** sobre `#EBEEF0`. |
| **813** | `<h1 ... text-[#ECEDEF]">Painel</h1>` | Mesmo problema — contraste **1.01:1** em modo claro sem o hack do CSS. |
| **627-628** | `text-[#ECEDEF]` e `text-[#9A9D96]` na seção "Engajamento no Instagram" | Cores **somente-dark** sem contraparte clara. Contraste: **1.01:1** e **2.36:1** no claro. |
| **815, 821** | `text-[#8A8D86]` (período e "Atualizando…") | Contraste **2.89:1** no claro — falha AA. |
| **96, 99** | `no_goals`/`no_data`: `bg-[#1F211D] text-[#9A9D96]` | Badge **dark-only** usado em modo claro. |
| **38-49** | Constante `C` com paleta hex duplicada | Duplica tokens já existentes em `index.css` (`--color-brand`, etc.). |
| **55-56** | Constante `SURFACE` usa `ady-decor` + `bg-white`/`dark:bg-[#161814]` | Workaround para escapar dos `!important` do `index.css`. |
| **167, 193, 215...** | Padrão `text-[#17708A] dark:text-[#1E88A8]` repetido dezenas de vezes | Duplicação massiva; não usa tokens `text-brand`. |

### 3.3 CRÍTICO — `pages/estudio/CreativeStudio.tsx`

**Arquivo:** `apps/web/src/pages/estudio/CreativeStudio.tsx` (507 linhas, **46 cores hex**)

| Linha | Código | Problema |
|---|---|---|
| **271** | `<div className="text-sm font-semibold text-[#101828]">` (label do template) | `#101828` (quase preto) **sem** variante `dark:` → **1.03:1** sobre `#141512` → **texto invisível no dark mode**. |
| **279** | `<label ... text-[#101828]">Descreva seu anúncio</label>` | Mesmo problema → **invisível no dark**. |
| **284** | `textarea ... bg-[#FCFCFD] text-[#101828]` | O `index.css` troca o fundo para `var(--color-surface)` no dark, mas **o texto continua `#101828`** → texto invisível. |
| **286** | `text-[#667085]` (contador e legenda) | **3.68:1** no dark — falha AA. |
| **229, 239** | `border-[#E6E8EC] bg-white text-[#667085]` | `bg-white` é remapeado pelo CSS, mas `text-[#667085]` não — contraste baixo no dark. |
| **218** | `border-[#E6E8EC]` | Só funciona no dark graças ao override do `index.css`. |
| **222, 257** | `text-[#E8631A]` | Cor laranja legada usada diretamente; sem token. |

> **Nota importante:** o `index.css` remapeia `bg-[#FCFCFD]`/`bg-white` no dark (linhas 262-267),
> mas **não** remapeia `text-[#101828]`, `text-[#667085]`, `text-[#1C1C1E]` — por isso o texto fica
> invisível. É o caso mais grave de quebra real de dark mode.

### 3.4 ALTO — Componentes `ui/*` que dependem de patches do CSS

| Arquivo | Linha | Problema |
|---|---|---|
| `components/ui/input.tsx` | **10** | `focus:border-[#E8631A]` (laranja legado) + `disabled:bg-gray-50` — no dark mode o fundo desabilitado fica **cinza-claro** (o override `.dark .bg-gray-50` não casa com `disabled:bg-gray-50`). |
| `components/ui/select.tsx` | **12** | Mesmos problemas do `input`. |
| `components/ui/dropdown-menu.tsx` | **40, 70** | `text-gray-700`/`text-gray-900` — dependem do patch `.dark .text-gray-*` do `index.css`; quebra se o componente for renderizado fora de um ancestral com classe `.dark` (ex.: dentro de portal do Radix em outra árvore). |
| `components/ui/button.tsx` | **24, 32, 40, 44, 48** | `bg-[#17708A]`, `text-[#17708A] dark:text-[#1E88A8]` etc. — funciona, mas duplica a paleta; não usa `bg-brand`/`text-brand`. |

### 3.5 ALTO — `components/StatusBadge.tsx`

**Arquivo:** `apps/web/src/components/StatusBadge.tsx:17-48`

- `learning`: `bg-blue-50 text-blue-700` — **sem** override no dark → badge azul-claro num tema escuro.
- `pending`: `bg-yellow-50 text-yellow-700` — idem.
- `rejected`: `bg-red-50 text-red-700` — idem (só `text-red-500/600` têm override no CSS).
- `active`: `bg-green-50 text-green-700` — o `bg-green-50` é remapeado mas o `text-green-700` **sim**,
  criando inconsistência entre os status.

### 3.6 MÉDIO — Superadmin (dark forçado, mas tudo hardcoded)

**Arquivos:** `pages/superadmin/AdminShell.tsx`, `AdminDashboard.tsx`, `UsersPage.tsx`,
`PlansPage.tsx`, `TenantsPage.tsx`, `TenantDetailPage.tsx`, `AdminLogin.tsx`, `ForceDarkMode.tsx`

- `AdminShell.tsx:47,143` — `bg-[#0C0D0A] text-[#ECEDEF]` hardcoded (funciona porque o router
  embrulha com `ForceDarkMode`).
- `AdminShell.tsx:160` — `<div className="dark ...">` força `.dark` num subárvore (duplicado com o
  `ForceDarkMode` que já põe `.dark` no `<html>`).
- `AdminDashboard.tsx:31,130,139,170-171` — estilos inline com paleta escura `#161714`,
  `#2A2D27`, `#ECEDEF`, `#5A605C`. Contraste `#5A605C` sobre `#161714` = **2.80:1** (falha AA).
- `ForceDarkMode.tsx:3-29` — mutação direta de `<html>` que **concorre** com o `ThemeProvider`
  (Redux). Se o usuário muda o tema enquanto está numa página `/admin`, o `ThemeProvider` reaplica
  o tema do Redux por cima do force; e o cleanup do `ForceDarkMode` restaura estado antigo.
- `AdminLogin.tsx:57-80` — fundo/card hardcoded escuros.

**Avaliação:** é uma decisão de produto (área admin "sempre escura"), mas está implementada como
cópia de cores em ~8 arquivos em vez de uma variante `dark` única, e o `ForceDarkMode` é uma
alternativa frágil ao `ThemeProvider`.

### 3.7 MÉDIO — Páginas públicas/especiais que não respeitam o tema

| Arquivo | Linha | Problema |
|---|---|---|
| `pages/roadmap/RoadmapPage.tsx` | **26-48, 131-164** | Página inteira hardcoded dark (`#0C0D0A`, `#141512`, `text-[#ECEDEF]`, `#6fc3dd`), **sem** variante clara — quebra se o usuário estiver em modo claro. |
| `pages/ComponentsDemo.tsx` | **139,154,164,174** | `text-[#1C1C1E]` sem `dark:` → texto quase preto invisível no dark mode (mesma classe de bug do CreativeStudio). |
| `components/UsageBadge.tsx` | **82,91,104,109** | Card `bg-[#161814]` + `text-[#ECEDEF]` — dark-only; usado fora do superadmin? Verificar contexto (linha 82 usa `border-white/10 bg-[#161814]` fixos). |
| `pages/estudio/GeradorCopy.tsx` | **145,294,393** | `bg-white`, `border-[#E0E0E0]`, `text-[#1C1C1E]` sem `dark:` — dependem de patches do CSS. |
| `components/FuryRuleDialog.tsx` | **160,172,201** | `bg-white text-[#1C1C1E]` sem `dark:` — mesmo problema. |
| `components/campaign-wizard/steps/Step3Audience.tsx` | **290,296,407,412** | `bg-white`, `border-gray-300`, `text-gray-900` sem `dark:` — dependem de patches. |
| `pages/configuracoes/PublicoContent.tsx` | **161,275** | Dropdown `bg-white border-gray-200` sem `dark:`. |
| `pages/auth/OtpInput.tsx` | **123** | `border-[#E0E0E0] bg-white` sem `dark:`. |

### 3.8 BAIXO — Diversos

- `components/InsightCard.tsx`, `MetricCard.tsx` (bom uso de `dark:`, mas com hex duplicado),
  `ProgressGoal.tsx`, `PeriodSelector.tsx`, `LoadingSpinner.tsx`, `EmptyState.tsx`,
  `SidebarUserCard.tsx`, `auth/GoogleLoginButton.tsx`, `auth/FacebookLoginButton.tsx` — usam
  combinações de hex + `dark:` que funcionam, mas duplicam a paleta em vez de usar tokens.
- `pages/superadmin/adminDashboard.utils.ts:12-14` — `planColor()` com paleta hardcoded.

---

## 4. Exemplos de Código com Problema

### Exemplo 1 — Texto invisível no dark mode (CreativeStudio)

```tsx
// apps/web/src/pages/estudio/CreativeStudio.tsx:279-285
<label className="text-sm font-semibold text-[#101828]">Descreva seu anúncio</label>
<textarea
  ...
  className="min-h-44 w-full rounded-2xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3
             text-sm text-[#101828] ..."
/>
```

Em modo escuro o `index.css` troca `bg-[#FCFCFD]` → `var(--color-surface)` (escuro),
mas `text-[#101828]` permanece **preto** → contraste 1.03:1 → **texto ilegível**.

### Exemplo 2 — Texto claro fixado sem contraparte (Dashboard)

```tsx
// apps/web/src/pages/dashboard/Dashboard.tsx:627-628
<h2 className="text-xl font-semibold text-[#ECEDEF]">Engajamento no Instagram</h2>
<p className="mt-1 text-sm text-[#9A9D96]">Métricas orgânicas no período selecionado</p>
```

Em modo claro, `#ECEDEF` sobre fundo claro = 1.01:1. Só não "vaza" por causa dos `!important`
do `index.css` que forçam `h2`→`#0f172a` e `p`→`#475569`.

### Exemplo 3 — Guerra de CSS com `!important` (index.css)

```css
/* apps/web/src/index.css:353-365 */
html:not(.dark) main [class*="bg-["]:not(.gradient-teal):not(...) {
  background-color: #ffffff !important;
  border: 1px solid #e2e8f0 !important;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.04) !important;
  border-radius: 1rem !important;
}
```

Qualquer componente que use `bg-[#algumaCoisa]` dentro de `main` perde o fundo escolhido.

### Exemplo 4 — Cor errada usada no componente, "consertada" no CSS

```tsx
// apps/web/src/components/ui/input.tsx:10
className="... focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/20 ..."
```
```css
/* apps/web/src/index.css:244-246 — remapeia laranja para petróleo */
[class*="bg-[#E8631A]"]:not(.gradient-spark) { background-color: #1E88A8 !important; }
```

O componente usa a cor **errada** e depende do CSS para corrigir — quebra se a classe for
construída dinamicamente (ex.: `focus:border-${cor}`).

### Exemplo 5 — Dark forçado no superadmin

```tsx
// apps/web/src/components/layout/AdminShell.tsx:47,160
<div className="min-h-screen bg-[#0C0D0A] text-[#ECEDEF] flex font-sans">
  ...
  <div className="dark p-6 lg:p-8">   {/* classe .dark forçada manualmente */}
```

### Exemplo 6 — Seletor de especificidade desesperada

```css
/* apps/web/src/index.css:528 */
html:not(.dark) button.filter-pill-active.filter-pill-active.filter-pill-active {
  color: #ffffff !important;
}
```

---

## 5. Análise de Contraste (modo claro e escuro)

Razões calculadas com WCAG (fórmula de luminância relativa). Referência AA: **4.5:1** para texto
normal, **3:1** para texto grande/UI.

### 5.1 Falhas no modo claro

| Par (texto/fundo) | Razão | Onde | Resultado |
|---|---|---|---|
| `#ECEDEF` / `#EBEEF0` | **1.01:1** | `Dashboard.tsx:809,813` | ❌ Falha total (invisível) |
| `#ECEDEF` / `#FFFFFF` | **1.17:1** | `Dashboard.tsx` (dentro de card) | ❌ Falha total |
| `#9A9D96` / `#EBEEF0` | **2.36:1** | `Dashboard.tsx:628` | ❌ Abaixo AA |
| `#8A8D86` / `#EBEEF0` | **2.89:1** | `Dashboard.tsx:815,821` | ❌ Abaixo AA |
| `#5A605C` / `#161714` | **2.80:1** | `AdminDashboard.tsx` | ❌ Abaixo AA (admin dark) |
| `#CF6F03` / `#FFFFFF` | **3.54:1** | Badges/botões `spark` | ❌ Abaixo AA (já corrigido no `Button` via `#B55F02`) |
| `#E8631A` / `#FFFFFF` | **3.37:1** | `CreativeStudio`, `GeradorCopy`, etc. | ❌ Abaixo AA |
| `#1E88A8` / `#FFFFFF` | **4.08:1** | `text-[#1E88A8]` sobre branco (links, ícones) | ⚠️ OK para UI/grande, falha p/ texto normal |
| `#17708A` / `#FFFFFF` | **5.64:1** | `Button` primary / links | ✅ Passa AA |

### 5.2 Falhas no modo escuro

| Par (texto/fundo) | Razão | Onde | Resultado |
|---|---|---|---|
| `#101828` / `#141512` | **1.03:1** | `CreativeStudio.tsx:271,279,284` | ❌ Falha total (invisível) |
| `#101828` / `#0C0D0A` | **1.10:1** | `CreativeStudio`, `ComponentsDemo` | ❌ Falha total |
| `#1C1C1E` / `#141512` | ~1.2:1 | `ComponentsDemo`, `FuryRuleDialog`, `GeradorCopy` | ❌ Falha total |
| `#667085` / `#141512` | **3.68:1** | `CreativeStudio.tsx:286` | ❌ Abaixo AA |
| `#2A2D27` / `#161714` | **1.29:1** | Borda dos cards do admin | ⚠️ Borda pouco visível |

### 5.3 Cores que passam (referência)

| Par | Razão |
|---|---|
| `#0F172A` / `#F8FAFC` | 17.06:1 ✅ |
| `#0F172A` / `#EBEEF0` | 15.32:1 ✅ |
| `#475569` / `#FFFFFF` | 7.58:1 ✅ |
| `#ECEDEF` / `#0C0D0A` | 16.64:1 ✅ |
| `#E08A2E` / `#0C0D0A` | 7.28:1 ✅ |

---

## 6. Encapsulamento de Estilos (Hardcoded Colors / Falta de Tokens)

### Padrão mais comum de violação
```tsx
text-[#17708A] dark:text-[#1E88A8]   // em vez de text-brand / text-brand-strong
bg-[#1E88A8]                          // em vez de bg-brand
text-[#ECEDEF] dark:text-[#ECEDEF]    // cores dark-only sem token
bg-white dark:bg-[#161814]            // em vez de bg-surface
```

### Paletas duplicadas fora dos tokens
- `Dashboard.tsx:38-49` — objeto `C` (bg/card/border/text/muted/primary/spark/danger).
- `AdminShell.tsx` + páginas superadmin — `#0C0D0A`, `#161714`, `#2A2D27`, `#ECEDEF`, `#5A605C`.
- `button.tsx`, `Sidebar.tsx` — `#17708A`/`#1E88A8` repetidos.
- `lib/constants.ts:7-8` — ainda define `primary: '#E8631A'` (laranja **legado**, diferente do
  `--color-brand: #1E88A8` dos tokens).
- `index.css:244-258` — precisa "re-mapear" `#E8631A` para `#1E88A8` porque o código ainda usa a
  cor antiga.

### Componentes que usam tokens corretamente (modelos a seguir)
- `components/ui/card.tsx`, `table.tsx`, `tabs.tsx`, `dialog.tsx` — `bg-surface`, `text-text-primary`, `border-border`.
- `components/ui/button.tsx` — tokens + `dark:` + notas de contraste AA no próprio código.
- `pages/auth/LoginPage.tsx`, `components/MetricCard.tsx`, `pages/NotFoundPage.tsx` — pares `dark:`/claro consistentes.
- `pages/planejador/components/CalendarView.css` — usa `var(--color-*)`.

---

## 7. Componentes que Não Respeitam o Theme Context

1. **`pages/roadmap/RoadmapPage.tsx`** — página pública totalmente dark, sem variante clara.
2. **`components/UsageBadge.tsx`** — card `bg-[#161814]`/`text-[#ECEDEF]` fixos (verificar uso
   fora do contexto escuro).
3. **`pages/superadmin/*` (8 arquivos)** — dark forçado por `ForceDarkMode` + `.dark` manual;
   não usam o contexto de tema, copiam a paleta.
4. **`pages/estudio/CreativeStudio.tsx`, `ComponentsDemo.tsx`, `FuryRuleDialog.tsx`,
   `GeradorCopy.tsx`, `Step3Audience.tsx`, `PublicoContent.tsx`, `OtpInput.tsx`** — cores claras
   hardcoded sem `dark:` (invisíveis no dark).
5. **`components/StatusBadge.tsx`** — badges de status com cores claras incompletas no dark.
6. **`pages/dashboard/Dashboard.tsx`** — texto dark fixado sem contraparte clara (só funciona
   por causa do CSS global).

---

## 8. Recomendações de Correção (por prioridade)

### 🔴 CRÍTICO (corrigir primeiro)
1. **`CreativeStudio.tsx` e todos os `text-[#101828]`/`text-[#1C1C1E]`/`text-[#667085]` sem
   `dark:`** — trocar por `text-text-primary`/`text-text-secondary` ou adicionar `dark:`
   (`dark:text-text-primary`). Cobre: `CreativeStudio.tsx`, `ComponentsDemo.tsx`,
   `FuryRuleDialog.tsx`, `GeradorCopy.tsx`, `Step3Audience.tsx`.
2. **`Dashboard.tsx`** — remover `text-[#ECEDEF]` das linhas 809/813/627-628; usar
   `text-text-primary`/`text-text-secondary` (tokens já existem). Remover `text-[#8A8D86]`/`#9A9D96`.
3. **Refatorar `index.css`** — reduzir os 77 `!important`:
   - Definir tokens semânticos em `@theme` (já existem) e **parar de forçar** fundos/bordas/textos
     globalmente.
   - Manter no máximo overrides pontuais documentados, com comentário de motivo e data.
   - Remover o `@import "tailwindcss"` duplicado (linha 207).

### 🟠 ALTO
4. **`input.tsx`/`select.tsx`** — trocar `focus:border-[#E8631A]` por `focus:border-brand`
   (ou `border-[#1E88A8]`), e `disabled:bg-gray-50` por `disabled:bg-surface-secondary`.
5. **`StatusBadge.tsx`** — definir variantes com tokens/`dark:` completos para todos os status
   (blue/yellow/red também).
6. **`dropdown-menu.tsx`** — `text-gray-700`/`text-gray-900` → `text-text-secondary`/`text-text-primary`.
7. **Criar tokens de marca e aplicá-los**: `--color-brand` já existe — substituir `text-[#17708A]`
   por `text-brand-strong` (novo token) e `text-[#1E88A8]` por `text-brand` nos componentes-chave
   (`Sidebar`, `Dashboard`, `button.tsx`).

### 🟡 MÉDIO
8. **Superadmin** — manter "sempre dark" como decisão de produto, mas:
   - Substituir `ForceDarkMode` por uma variante única (ex.: `AdminTheme` que aplica `.dark` uma vez).
   - Substituir as paletas hex inline por tokens `--admin-*` já existentes no `index.css`.
9. **`RoadmapPage.tsx`** — se deve respeitar o tema, adicionar variantes claras; senão, documentar
   como "página de campanha sempre dark".
10. **`UsageBadge.tsx`** — usar `bg-surface`/`border-border` + `dark:` em vez de hex fixos.

### 🟢 BAIXO
11. **Eliminar `ady-decor` como workaround** (`Dashboard.tsx`, `ConectarMetaPage.tsx`) depois da
    refatoração do `index.css`.
12. **Remover paletas duplicadas** (`Dashboard.tsx` const `C`, `lib/constants.ts:7-8` com
    `#E8631A` legado).
13. **Adicionar testes de tema**: nenhum teste cobre `ThemeProvider`/`useTheme`/alternância.
    Sugestões:
    - Teste de unidade: `ThemeProvider` aplica `.dark`/`data-theme`/`colorScheme` quando o Redux
      muda (jsdom).
    - Teste de `useTheme`: `setDark(true)` persiste `fury-theme` e despacha `setTheme`.
    - Smoke test de renderização de componentes-chave (`Dashboard`, `CreativeStudio`,
      `StatusBadge`, `Button`) nos dois temas (checar classes geradas).

---

## 9. Prioridades Resumidas

| Prioridade | Item | Impacto |
|---|---|---|
| 🔴 Crítico | Texto invisível no dark (`CreativeStudio`, `ComponentsDemo`, `FuryRuleDialog`, `GeradorCopy`) | Bloqueia uso no dark mode |
| 🔴 Crítico | Texto dark-only no claro (`Dashboard.tsx:809,813,627`) | Quebra visual no claro |
| 🔴 Crítico | Refatorar `index.css` (77 `!important`) | Causa raiz; impede evolução do tema |
| 🟠 Alto | `input`/`select`/`dropdown`/`StatusBadge` com cores incompletas | Inconsistências visíveis |
| 🟡 Médio | Superadmin hardcoded + `ForceDarkMode` | Fragilidade; duplicação |
| 🟡 Médio | `RoadmapPage`/`UsageBadge` dark-only | Não respeitam tema |
| 🟢 Baixo | Duplicação de paleta, `ady-decor`, falta de testes de tema | Dívida técnica |

---

## 10. Método

1. Grafo de conhecimento atualizado (`full_rebuild` — 713 arquivos, 6154 nós).
2. Busca semântica por `theme/dark/light/color/css` + consultas estruturais.
3. Leitura direta de `index.css`, `ThemeProvider`, `useTheme`, `authSlice`, `router.tsx`, UI kit e
   páginas críticas.
4. Varredura por regex: hex colors (752), cores arbitrárias Tailwind (588), estilos inline (29),
   `!important` (77), `dark:` (350).
5. Cálculo de contraste WCAG para 27 pares de cor.