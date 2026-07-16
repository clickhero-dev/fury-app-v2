# Clarify: Planejador IA — Resiliência, inputs inesperados e debuggabilidade

**Feature**: Resiliência do fluxo de geração + checklist dinâmico
**Date**: 2026-07-16

Perguntas de validação respondidas por inspeção de código:

## Q1 — Esse fluxo/função reage bem a inputs inesperados?

**Não.** Três pontos críticos:

1. **Checklist sempre verde** (`IdleStatus.tsx`): os 5 checks exibidos (`Instagram conectado ✓`, `Facebook conectado ✓`, etc.) são **hardcoded** — não consultam API nem banco. Um usuário sem Instagram conectado vê o check como OK, clica "Gerar", e o pipeline dos 10 agentes tenta processar contexto vazio. O erro só aparece minutos depois no Quality Agent, sem relação clara com a causa raiz.

2. **`tenantId: 'current'`** (BUG-001, já corrigido): frontend enviava string literal em vez do UUID do tenant → 400. Input inesperado derrubava o fluxo inteiro sem mensagem clara.

3. **Erro 409 (lock)**: se o usuário clica "Gerar" duas vezes, o servidor rejeita com 409. O frontend trata isso — exibe o erro no banner vermelho. ✅ Este ponto está OK.

## Q2 — Essa funcionalidade é resiliente?

**Parcialmente.** O que funciona:

- ✅ Lock de concorrência (não permite 2 jobs simultâneos)
- ✅ Redirect pós-geração (se o job completa, vai pro calendário)
- ✅ localStorage recupera jobId após refresh
- ✅ `parseAgentJSON` tolera markdown nas respostas da IA

O que NÃO funciona:

- ❌ **Checklist mentiroso**: usuário pode estar sem Meta conectado, sem produto, sem objetivo — o IdleStatus mostra tudo verde. O pipeline roda e falha em silêncio (ou produz conteúdo genérico sem contexto). O erro final não aponta a causa real.
- ❌ **Nenhuma validação prévia**: o botão "Gerar" nunca está desabilitado. Não há guardrails antes de disparar 10 chamadas de LLM (30-60s de execução + custo de tokens).
- ❌ **Job tracking em memória**: se o container reiniciar, todo o progresso é perdido. O frontend mostra "A geração anterior foi interrompida" — quebra a expectativa de resiliência.

## Q3 — Se ocorrer um bug, isso será claro para o usuário e desenvolvedor para ser corrigido?

**Não é claro.** Problemas:

1. **Erro silencioso no checklist**: se o pipeline falha por falta de dados do tenant, o `GeneratingState` mostra "Erro: ..." mas a mensagem é genérica ("Pipeline error"). Não aponta "Instagram não configurado" ou "Produto não cadastrado". O usuário não sabe o que corrigir.

2. **Sem logs de validação prévia**: não há endpoint de diagnóstico. Um desenvolvedor não consegue responder "este tenant tem tudo configurado pra gerar?" sem consultar 3 tabelas diferentes (meta_connections, clientGoals, brandKits).

3. **Erro de IA (JSON parse)** já tratado: `parseAgentJSON` com fallback + `try/catch` com `AppError(502, 'AI_PARSE_ERROR')` → mensagem clara no banner. ✅

4. **404 de job perdido**: mensagem "A geração anterior foi interrompida" + link pra reiniciar. ✅ Claro pro usuário.

**Conclusão**: o maior gap de resiliência é a **ausência de validação prévia** (checklist dinâmico). Sem ela, bugs são detectados tarde, com mensagens genéricas, e o usuário não sabe o que fazer.
