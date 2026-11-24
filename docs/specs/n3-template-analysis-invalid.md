# [N3] Investigar TEMPLATE_ANALYSIS_INVALID na geração de imagens

Ticket: https://app.clickup.com/t/1dfch0anar8

## Evidência e limites
Cinco eventos 502 entre 15/11/2026 14:30:03Z e 19:31:27Z, segundo o relato; nenhum nas últimas 24h da consulta. Sem ambiente, não atribuir a HMG/produção. Fixtures sintéticas reproduzem classes de falha, não comprovam o conteúdo das respostas históricas. PR #434 toca geração com fotos, mas não modifica a validação da análise; preservar esse fluxo.

## Contrato e critérios de aceite
- Aceitar somente JSON (também cercado por markdown) validado pelo schema existente. Tratar entrada não textual, vazia, JSON inválido e schema inválido com motivos finitos; não transportar conteúdo nem erros Zod para cliente/telemetria.
- Falha de análise nunca chama geração/persistência. Manter devolução de cota no service. Não inventar fallback de plano.
- Adapter usa wrapper HTTP com deadline de 30s para visão, informa somente status/retryable e distingue timeout/rede. Retry da análise: no máximo duas chamadas, com pausa de 250ms, apenas rede/timeout/408/429/5xx; não repetir saída inválida, auth, pagamento ou erro desconhecido.
- Resposta final client-safe distingue análise inválida de indisponibilidade. UI existente apresenta mensagem e ação manual que retorna ao formulário para correção; nunca repetir geração automaticamente.
- Um evento terminal por análise: success/recovered/failed, attempts, failureReason, model e environment (APP_ENV, DEPLOYMENT_ENV, NODE_ENV ou unknown). Somar eventos por outcome fornece contagem de recuperações/falhas. Sem prompts, URLs, payload, respostas ou erro bruto.

## Execução e validação
1. Escrever regressões Gherkin pt-BR com fixtures sintéticas: plano válido/cercado, tipos inesperados, vazio, sintaxe/schema, recuperação transitória, timeout final e não retry permanente. Confirmar Red antes de produção.
2. Implementar classificação no parser, adapter sanitizado e executor de análise isolado; integrar ao serviço sem alterar persistência/domínio.
3. Verificar cota e ausência de geração em falha nos testes do serviço; testar adapter HTTP com mocks e telemetria por allowlist. Verificar o caminho manual da UI.
4. Rodar suites focadas e builds, revisar diff; abrir PR para hmg. Verificar CI no SHA final e ausência de conflitos/base atualizada. Sem merge/deploy.

ADR-0001 lido; ADR-0002 mencionado pela skill não está presente no checkout hmg. Aplicar wrapper, timeout e sanitização disponíveis no projeto. Ferramentas MCP do grafo indisponíveis na sessão; investigação por fonte e testes.

## Resultado local
- 91 testes API passaram em 8 arquivos (parser, executor, adapter HTTP, integração do serviço/cota, controller, analytics e error handler).
- 35 testes de EstudioHome passaram; cenário Chromium com API simulada passou: erro seguro → formulário preservado → edição → reenvio manual.
- Red observado: adapter tinha 12 falhas de classificação; espaços obrigatórios eram aceitos; retry da UI apagava seleção; ambiente não era emitido. Green após correção.
- Builds shared/db/API e web passaram com dependências próprias da worktree. Primeiro build com dependências emprestadas apontou tipos antigos de outro checkout; descartado e repetido isoladamente.
- Configurar APP_ENV=hmg ou APP_ENV=production no deploy para distinguir ambientes que compartilham NODE_ENV=production. Este trabalho não muda configurações remotas nem atribui ambiente aos eventos históricos.
- Consulta operacional: contar `studio_template_analysis` por `environment`, `model`, `outcome` (`recovered` e `failed`) e `failureReason`; `attempts` indica recuperação na segunda chamada. O evento conta a análise, não a geração/revisão posterior.
