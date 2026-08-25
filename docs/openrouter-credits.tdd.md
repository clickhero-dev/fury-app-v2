# TDD Evidence Report — OpenRouter credits check

Date: 2026-08-24 · Branch: `dev`

## Source plan

Nenhum `*.plan.md`. User journeys e garantias foram derivadas durante esta
sessão TDD a partir do problema real:

> O `creative.agent` falhava repetidamente com `OpenRouter image error: ...
> "Insufficient credits" (code 402)` para todos os dias, gastando retries por
> post até o `[planner-worker] job failed`. O pedido: a API deve saber o estado
> do saldo OpenRouter e, **antes** de chamar o OpenRouter, devolver erro
> apropriado ao frontend.

Correção de negócio recebida durante o trabalho: o produto é **SaaS** — o Fury
banca o custo de criação, então **não** se deve expor saldo/valores de crédito
ao cliente. A mensagem de erro deve ser neutra ("impossibilitados de gerar
imagens... contate o suporte") e **não** deve existir rota pública de créditos.

## User journeys

1. Como usuário do studio/calendário, quero que a API confira o saldo OpenRouter
   **antes** de gerar a primeira imagem, para receber um erro claro (HTTP 402)
   em vez de múltiplas falhas genéricas após retries desperdiçados.
2. Como pipeline do planner, quero checar créditos **uma vez** no início da
   geração de imagens, para não gastar tempo/retries quando não há saldo.
3. Como cliente, quero **não** ver valores de saldo/custos da plataforma nos
   erros (a Fury assume o custo); a mensagem deve pedir contato com o suporte.

## Task report

| Behavior | Validação | RED/GREEN | Garantia |
|----------|-----------|-----------|----------|
| `getCreditState()` lê saldo via `GET /auth/key` com cache em memória (TTL 60s) | `npx vitest run apps/api/src/__tests__/openrouter-credits.test.ts` | RED→GREEN | Saldo computado de `limit-usage`, `credits` ou `total_credits-total_usage`; cache evita refetch dentro do TTL; `clearCreditCache()` força novo fetch |
| `assertCreditsAvailable()` + `assertCreditsOrThrow` lançam 402 `OPENROUTER_INSUFFICIENT_CREDITS` client-safe | mesmo | RED→GREEN | Saldo zerado/free-tier → 402 com mensagem neutra "contate o suporte"; saldo ok → resolve; saldo desconhecido (fail-open) → NÃO bloqueia |
| `generateImage` mapeia 402 "Insufficient credits" p/ erro 402 específico (em vez de 502 genérico) | mesmo | RED→GREEN | Corpo JSON 402 ou texto não-JSON com "insufficient credits" → 402 específico; erros não-crédito mantêm 502 `OPENROUTER_IMAGE_ERROR`; corpo vazio → 502 |
| `creativeAgent` e `imageGenerationAgent` checam créditos UMA vez antes de gerar imagens | `creative-agent.test.ts`, `image-generation-agent.test.ts` | RED→GREEN | Sem saldo → aborta sem chamar `generateImage`/upload; com saldo → gera normalmente |

Execução real:
- **RED**: `npx vitest run apps/api/src/__tests__/openrouter-credits.test.ts
  apps/api/src/__tests__/image-generation-agent.test.ts` → 11 falhas (métodos
  ausentes: `getCreditState`, `clearCreditCache`, `assertCreditsAvailable`;
  `generateImage` devolvia 502 genérico no 402).
- **RED (creative)**: `npx vitest run apps/api/src/__tests__/creative-agent.test.ts`
  → 2 falhas (guard não implementado).
- **GREEN**: suíte afetada (4 arquivos) → **21/21 pass**.
- **Typecheck**: `cd apps/api && npx tsc --noEmit` → 0 erros.
- **Lint** (arquivos de origem): 0 erros (apenas warnings `no-explicit-any`
  pré-existentes; o "parsing error" em `__tests__` é quirk de config do projeto,
  idêntico em `openrouter-logo.test.ts` pré-existente).

## Test specification

| # | O que é garantido | Test file | Tipo | Resultado |
|---|-------------------|-----------|------|-----------|
| 1 | Saldo = `limit - usage`, hasCredits true acima do mínimo | `open-router-credits.test.ts:getCreditState` | unit | PASS |
| 2 | hasCredits false quando saldo abaixo do mínimo | idem | unit | PASS |
| 3 | free tier sem saldo → sem créditos | idem | unit | PASS |
| 4 | Fail-open (hasCredits true, credits null) p/ resposta não-OK | idem | unit | PASS |
| 5 | Fail-open p/ erro de rede (fetch lança) | idem | unit | PASS |
| 6 | Cache: refetch 1x dentro do TTL | idem | unit | PASS |
| 7 | `clearCreditCache()` força refetch | idem | unit | PASS |
| 8 | Parse shape `data.credits` | idem | unit | PASS |
| 9 | Parse shape `total_credits - total_usage` | idem | unit | PASS |
| 10 | `assertCreditsAvailable` lança 402 client-safe sem saldo | idem | unit | PASS |
| 11 | `assertCreditsAvailable` resolve com saldo | idem | unit | PASS |
| 12 | `generateImage` 402 (JSON) → 402 específico, não 502 | idem | unit | PASS |
| 13 | `generateImage` mantém 502 p/ erro não-crédito | idem | unit | PASS |
| 14 | `generateImage` 402 (corpo não-JSON) → 402 específico | idem | unit | PASS |
| 15 | `generateImage` corpo vazio → 502 (guard isInsufficientCreditsError) | idem | unit | PASS |
| 16 | `creativeAgent` aborta sem gerar quando sem créditos | `creative-agent.test.ts` | unit | PASS |
| 17 | `creativeAgent` checa créditos 1x antes de gerar | idem | unit | PASS |
| 18 | `imageGenerationAgent` checa créditos 1x antes | `image-generation-agent.test.ts` | unit | PASS |
| 19 | `imageGenerationAgent` aborta sem gerar/upload sem créditos | idem | unit | PASS |

## Coverage e gaps conhecidos

Cobertura (suíte afetada, `--coverage`, v8):

| Arquivo | % Stmts | % Lines | Observação |
|---------|---------|---------|------------|
| `agents/creative.agent.ts` | 58.69 | 56.09 | Não cobertos: `uploadGeneratedImage` → R2/fs real (61-81), retry catch — pré-existentes |
| `agents/image-generation.agent.ts` | 48.83 | 48.71 | Não cobertos: `generateDalle3Fallback` (124-144), `validateAndUploadImage` — pré-existentes |
| `services/llms/openrouter.service.ts` | 40.00 | 40.78 | Não cobertos: `generateVideo`/`regenerateAd`/`editImage`/`inpaintImage` (211-420) — pré-existentes, fora do escopo |

**O código novo de créditos está coberto nas branches relevantes.** Os
percentuais por arquivo ficam abaixo de 80% porque arrastam métodos legados não
testados (geração de vídeo, regeneração, edição/inpainting, DALL-E fallback) que
não fazem parte desta mudança. Ajuste o teste de cobertura por arquivo para
apenas os arquivos/linhas do escopo se quiser o gate em 80%.

## Merge evidence (checkpoints criados — `dev`)

- `824a8e7` `test: add reproducer for OpenRouter credits check (RED gate)` — 11+2 falhas
- `795adbe` `fix: check OpenRouter credits before image generation, return 402 client-safe` — 21 pass
- `aeeed37` `test: cover credit edge branches (parse shapes, network fail-open, non-JSON 402)` — 15+4+2 pass

Se estes forem squashados, mover este resumo RED/GREEN para o corpo do PR/squash.

## Addendum — fix 2: gate antes de o pipeline INICIAR (bug reportado após o 1º push)

**Problema relatado:** "no planejador de IA, esse fluxo não funcionou bem, ele
**iniciou**, enquanto deveria ser parado." O check anterior ficava nos agentes
`creative`/`image-generation` (etapas 7-8), mas o pipeline já havia rodado
Context → Research → Analytics → Strategy → Planner → Copywriter (chamadas de
LLM via OpenRouter que **também** consomem crédito e custo) antes.

**Correção:** gate no **início** do fluxo.
- `startPlanGeneration()` (`planner.service.ts`) chama `assertCreditsAvailable()`
  no topo, antes do lock e da criação/enfileiramento do job → sem saldo, devolve
  402 ao front **sem iniciar nada** (nem cria job, nem enfileira, nem chama LLM).
- `runPlannerWorkflow()` (`planner-workflow-runner.ts`) tem a mesma guard como
  safety net dos caminhos que não passam por `startPlanGeneration` (fallback
  inline do enqueue e recovery de jobs interrompidos).

**RED/GREEN:** `planner-credits-gate.test.ts` (RED: pipeline prosseguia sem gate →
GREEN: 402 + `plannerStore.create`/`enqueuePlanGeneration` não chamados). Suíte
afetada (planner, stateMachine/api-startup, créditos) **45+37 testes pass**; `tsc`
0 erros; diff limpo (só o topo do `startPlanGeneration`).

**Commits:** `cdf5290` (RED) + `ae42f4f` (GREEN).
