# Handoff — Spec 012: Consistência de Tema Claro/Escuro (ady)

**Status: execução completa.** Esta pasta começou como um plano (8 rodadas de verificação, zero código) e terminou como uma execução real, ponta a ponta, com verificação objetiva de contraste (WCAG AA, via `accesslint` contra o app rodando de verdade — não leitura de código) e confirmação visual real (screenshots via CDP, nos dois temas). Duas rodadas de bugs foram reportadas ao vivo pelo usuário depois de testar no navegador, investigadas e corrigidas na causa raiz, não só no sintoma.

## O problema, em uma frase

O modo escuro do ady foi construído certo desde o início; o modo claro foi remendado por cima com um bloco de CSS genérico (`index.css`, ~140 linhas de `!important`, fora de qualquer `@layer`) que briga com componentes que já fazem tema corretamente — e a causa raiz real era que o componente de botão do design system (`components/ui/button.tsx`) nunca teve modo claro.

## Como ler esta pasta (nessa ordem)

1. **`spec.md`** — o quê e por quê. Diagnóstico completo, achado por achado (`KF-001` a `KF-021`), com arquivo:linha de cada bug e a evidência que confirma cada um. `KF-016` a `KF-021` são os achados da execução real (pós-handoff original) — leia esses primeiro se só quiser saber "o que mudou desde o plano".
2. **`plan.md`** — como (plano original, não atualizado com a Fase 9 — ver nota abaixo). A decisão de arquitetura central (o que fazer com o bloco CSS genérico — resposta: nada, por enquanto) e comparação de abordagens.
3. **`tasks.md`** — o passo a passo, com status real. Fases 1-8 são o plano original, todas `[x]` executadas. **Fase 9 é nova, não estava no plano** — registra 6 achados adicionais encontrados durante a implementação, incluindo os dois bugs que o usuário reportou ao vivo.

## O que foi feito, de verdade (não é mais um plano)

- **Causa raiz corrigida**: `button.tsx` e `card.tsx` (design system) agora usam tokens semânticos com par claro/escuro real, em vez de cor hardcoded fixa. 25 arquivos consumidores verificados.
- **22 + N ocorrências de contraste corrigidas**: o `#1E88A8` (petróleo escuro) usado como cor de texto sobre fundo claro, violando a regra AA do guia de marca, foi trocado por `#17708A` em todos os pontos confirmados como violação real (falsos positivos — cards sempre-escuros onde a cor original está correta — identificados e **não** tocados).
- **Dois padrões sistêmicos de contraste novos, achados na execução** (não estavam no plano original): botões com fundo `#1E88A8`/`#CF6F03` sólido e texto branco reprovando AA em repouso (~18 pontos corrigidos, incluindo a variante `primary` do `Button` — que sozinha cobre todas as telas de autenticação) — ver `KF-019`/`KF-020` em `spec.md`.
- **Dois bugs de CSS de causa raiz achados na execução**: o mecanismo de "escape" do bloco genérico (`.ady-decor`) só excluía o elemento com a classe, não os descendentes — texto sumia dentro de cards que deveriam ficar sempre escuros; e uma regra duplicada de `h1`/`h2`/`h3` sem a mesma exceção da regra original quebrava o banner do Planejador IA. Ver `KF-016`/`KF-017`.
- **Um bug de stacking context achado e corrigido com a ajuda do usuário**: o gradiente decorativo de fundo do onboarding Meta "cortava" no modo claro porque o `<main>` (com `z-index` explícito) pintava por cima de um irmão sem `z-index` — não era problema de cor/opacidade do gradiente, como se tentou corrigir em várias rodadas anteriores. Ver `KF-018`.
- **O Painel (Dashboard) foi retematizado de verdade**, não só remendado: os 6 blocos de card que antes ficavam permanentemente escuros (stopgap de uma rodada anterior desta mesma sessão, pra não deixar texto invisível) agora têm fundo/texto claros no modo claro e escuros no escuro. A constante `SURFACE` foi consolidada pra ser autocontida — **cards novos que a usarem já nascem corretos nos dois temas**, sem repetir nada.
- **Código morto removido**: `AuthLayout.tsx`, `FuryLiveFeed.tsx` e seu hook (`useFuryLiveFeed.ts`).
- **Dois bugs de acessibilidade sem relação com cor**, achados no caminho: botão de recolher a barra lateral (só ícone) sem `aria-label`; `<select>` de conta de anúncios sem rótulo associado.

## O que ainda está genuinamente em aberto (não é esquecimento, é decisão consciente)

- **KF-009 (parcial)**: o padrão `text-brand`/`text-admin-petrol` (cor fixa, não varia por tema) foi corrigido só no item ativo da barra lateral (maior visibilidade). ~40 outras ocorrências em 13+ arquivos continuam de fora — a maioria é uso de ícone (correto), mas uma parte real é texto/label com o mesmo bug de contraste; separar as duas coisas é trabalho do tamanho do KF-002 original.
- **KF-006**: sinalização de "bom/ruim" por cor em `Metas.tsx` fica sem sinal visual no modo claro (bug funcional, não só estético) — adiado por decisão explícita do usuário.
- **KF-007 (grande, fora desta spec)**: Estúdio Criativo e o wizard de campanha nunca passaram pelo rebrand Fury→ady. Mais de 90 ocorrências em ~25 arquivos. Maior em volume que esta spec inteira — precisa de spec própria.
- **KF-021**: `/admin/login` não fica genuinamente em modo escuro forçado (race entre dois componentes de tema na montagem) — investigado e diagnosticado, mas fora do escopo por decisão do usuário (a tela é sempre-escura por design, não precisa de modo claro).
- **~20 dos 25 arquivos consumidores de `Button`/`Card`** não tiveram verificação visual dedicada (a maioria no módulo Estúdio, território do KF-007 acima) — provavelmente corretos por herdarem os componentes já corrigidos, mas não confirmados um a um.
- `plan.md` **não foi atualizado** com o conteúdo da Fase 9 — ainda reflete só o plano original. Se for reabrir esta spec, `spec.md` (KF-016 a KF-021) e `tasks.md` (Fase 9) são as fontes de verdade sobre o que realmente aconteceu, não `plan.md`.

## Ferramentas e método usados na execução (para quem for continuar)

- **`accesslint`** (MCP `plugin:accesslint:accesslint`, `audit_live`) contra o app rodando de verdade (`npm run dev`) — substituiu julgamento visual subjetivo por medição objetiva de contraste em todas as verificações desta fase. **Pegadinha aprendida**: a ferramenta reaproveita abas do Chrome que já combinam com a URL auditada — depois de uma correção, **feche a aba antes de reauditar** (ou garanta que é uma aba nova), senão o resultado pode vir de uma renderização anterior, dando falsa impressão de que a correção não funcionou.
- **CDP direto** (WebSocket + `Runtime`/`Page`/`DOM`/`CSS` domains do Chrome DevTools Protocol, sem Playwright) para login, navegação, alternância de tema via `localStorage`, screenshot real, e inspeção de regras CSS efetivamente aplicadas (`CSS.getMatchedStylesForNode`) quando o comportamento visual não batia com a leitura do código-fonte.
- Cálculo manual de contraste WCAG (luminância relativa + fórmula de razão de contraste) para decidir tons de cor **antes** de aplicar, em vez de tentativa-e-erro — usado para chegar em `#17708A`, `#2A9BC0`, `#B55F02`, `#9A4F02`, `#145E74` como os tons "seguros" reutilizados em várias correções desta fase.
- Build real (`tsc --noEmit`) depois de cada rodada de edição, não só no final.

## Se for continuar esta frente de trabalho

Não há mais nenhuma "Fase 1" óbvia pendente nesta spec — o que resta são as três frentes fora de escopo já documentadas (remoção do bloco CSS genérico; KF-009 completo; KF-007/rebrand), cada uma grande o suficiente para ser sua própria spec. Comece por `spec.md` KF-016 a KF-021 pra entender o que mudou desde o plano original, depois `tasks.md` Fase 9 para o detalhe execução-a-execução.
