# Plano: Melhorar Resiliência do Fluxo de Criação de Conteúdo com IA

**Data**: 2026-08-12
**Status**: Implementação em andamento
**Feature**: Planejador IA (`specs/002-planejador-ia/`)

## Resumo

O pipeline de 10 agentes do Planejador IA tinha múltiplos pontos de falha silenciosa. Este plano documenta as melhorias implementadas e as pendentes para tornar o fluxo resiliente, debuggável e com feedback claro ao usuário.

---

## Implementado ✅

### 1. Timeout e Retry em Todos os Agentes

**Arquivos**: `apps/api/src/agents/utils.ts`, todos os `.agent.ts`

- **`withTimeout(promise, ms, context)`** — envolve qualquer Promise com timeout. Rejeita com `TimeoutError` se exceder o limite.
- **`withRetry(fn, { maxRetries, baseDelayMs, context })`** — retry com backoff exponencial (2s, 4s).
- Aplicado em **todos os 10 agentes**:
  - Agentes LLM: timeout de 30s + 2 retries
  - Geração de imagem: timeout de 60s
  - Upload de imagem: timeout de 15s
  - DB (Context Agent): timeout de 10s
- **Timeout global do pipeline**: 120s — aborta se o pipeline inteiro exceder.

### 2. Validação Prévia no Backend

**Arquivos**: `apps/api/src/services/planner.service.ts`, `apps/api/src/controllers/planner.controller.ts`

- **`validatePrerequisites(tenantId)`** — verifica Meta conectada, produto, objetivo, tom de voz antes de iniciar job.
- **`startPlanGeneration`** agora é async e rejeita com `400 MISSING_PREREQUISITES` + lista detalhada do que falta.
- Controller atualizado para `await startPlanGeneration()`.

### 3. Validação de Output de Cada Agente

**Arquivo**: `apps/api/src/agents/orchestrator.ts`

Cada agente tem seu output validado antes de passar ao próximo:
- Context Agent: tenant name presente
- Research Agent: trends não vazio
- Analytics Agent: bestFormats não vazio
- Strategy Agent: contentPillars não vazio
- Planner Agent: posts não vazio, max 30
- Copywriter Agent: legendas geradas, count = posts
- Creative Agent: prompts gerados

### 4. Mensagens de Erro Acionáveis

**Arquivo**: `apps/web/src/pages/planejador/components/GeneratingState.tsx`

- **`getErrorDetails(error)`** — categoriza erros e retorna mensagem + dica:
  - `Timeout:` → "Tempo esgotado" + "Tente novamente"
  - `MISSING_PREREQUISITES` → "Requisitos pendentes" + lista do que falta
  - `Qualidade não passou` → "Qualidade insuficiente" + detalhes
  - `imagens foram geradas` → "Falha na geração de imagens"
  - `Compliance rejeitou` → "Conteúdo rejeitado pelo compliance"
  - `OPENROUTER` → "Erro no serviço de IA"
  - Fallback genérico com mensagem original

### 5. Botões de Ação no Erro

**Arquivos**: `GeneratingState.tsx`, `PlanejadorPage.tsx`

- **Botão "Tentar novamente"** — limpa estado e re-inicia geração
- **Botão "Voltar ao início"** — volta ao idle state
- Ambos disponíveis no estado de erro do `GeneratingState` e no banner de erro do idle

### 6. Correção do Quality Agent

**Arquivo**: `apps/api/src/agents/quality.agent.ts`

- Renomeado `dup` → `noDuplicates` para clareza
- Check renomeado de "Conteúdo duplicado" → "Sem conteúdo duplicado"

### 7. Error Categorization no Orchestrator

**Arquivo**: `apps/api/src/agents/orchestrator.ts`

- `fail()` agora diferencia `TimeoutError`, `Error`, e erros genéricos
- Mensagens de timeout incluem contexto ("Pipeline completo", "Research Agent LLM call", etc.)

---

## Pendente 🚧

Nenhum item pendente — todas as melhorias planejadas foram implementadas.

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `apps/api/src/agents/utils.ts` | +`withTimeout`, +`withRetry`, +`TimeoutError` |
| `apps/api/src/agents/orchestrator.ts` | +timeout global, +validação output, +error categorization |
| `apps/api/src/agents/context.agent.ts` | +timeout 10s |
| `apps/api/src/agents/research.agent.ts` | +timeout 30s + retry |
| `apps/api/src/agents/analytics.agent.ts` | +timeout 30s + retry |
| `apps/api/src/agents/strategy.agent.ts` | +timeout 30s + retry |
| `apps/api/src/agents/planner.agent.ts` | +timeout 30s + retry |
| `apps/api/src/agents/copywriter.agent.ts` | Refatorado para usar `withTimeout` + `withRetry` |
| `apps/api/src/agents/creative.agent.ts` | +timeout 30s (LLM) + 60s (imagem) + 15s (upload) + retry |
| `apps/api/src/agents/branding.agent.ts` | +timeout 30s + retry |
| `apps/api/src/agents/quality.agent.ts` | Renomeado `dup` → `noDuplicates` |
| `apps/api/src/services/planner.service.ts` | +`validatePrerequisites`, `startPlanGeneration` async |
| `apps/api/src/controllers/planner.controller.ts` | `await startPlanGeneration()` |
| `apps/api/src/lib/planner-logger.ts` | Novo: logger estruturado com tenantId, jobId, timed() |
| `apps/web/src/pages/planejador/components/GeneratingState.tsx` | +`getErrorDetails`, +botões retry/back |
| `apps/web/src/pages/planejador/PlanejadorPage.tsx` | +`handleRetry`, +`handleBack` |
| `apps/web/src/pages/planejador/progress.ts` | +high-water mark para monotonicidade |
| `apps/web/src/pages/planejador/progress.test.ts` | Teste atualizado para nova lógica |

---

## Considerações Futuras

1. **Mover job tracking para DB** — atualmente em memória (`Map`), perde em restart. Tabela `planner_jobs` no Postgres escala para múltiplas instâncias.
2. **Checkpointing** — salvar output de cada agente no DB para retomar de onde parou.
3. **Métricas de custo** — rastrear tokens consumidos por job.
4. **Cache de pesquisa** — trends/holidays cacheados por mês/nicho.
5. **WebSocket/SSE** — substituir polling por push real-time (quando escala exigir).
