# Relatório: rate limit da Meta e uso provável do Fury

**Data:** 2026-09-26

**Escopo:** pipeline Meta da ADR-0003 e a conta validada localmente

**Conclusão:** a ADR reduz algumas chamadas, mas o sistema ainda não mede o uso reportado pela Meta nem controla o orçamento por conta de anúncios. O limite visto no teste local confirma que a integração pode atingir throttling; sem os headers de uso, não é possível calcular o percentual ou a cota exata consumida.

## 1. Como a Meta aplica os limites

A Meta não documenta um único número fixo de chamadas que sirva para toda integração. O limite pode depender do tipo de API e token, app, conta de anúncios, tier de acesso e carga de processamento. Para Marketing API, a documentação descreve limites Business Use Case (BUC), incluindo contagem de chamadas e limites de CPU/tempo. O header `X-Business-Use-Case-Usage` pode informar `call_count`, `total_cputime`, `total_time`, tipo do limite e `estimated_time_to_regain_access`. Outros contextos podem expor `X-App-Usage` ou `X-Ad-Account-Usage`.

Os números de utilização nos headers são percentuais de uso, não uma cota numérica universal. A Meta também recomenda parar as chamadas após atingir o limite, verificar o tipo de throttling e distribuir consultas ao longo do tempo. Os erros variam por tipo de limite: por exemplo, erros 4/17 para certos limites de app/usuário e códigos BUC como 80000 (Ads Insights), 80004 (Ads Management), 80005 (LeadGen) e 80002 (Instagram). Portanto, tratar apenas 4 e 17 não cobre todas as respostas de throttling documentadas.

Fontes: [Rate Limits — Graph API, Meta for Developers](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/).

## 2. Volume observado e conhecido

Na validação local anterior, a conta retornou **82 campanhas**, sendo **80 `OUTCOME_LEADS`**. A Meta respondeu com código 17 durante a varredura, e a execução registrou falhas parciais para as campanhas de leads. Uma consulta dirigida à campanha “Vagas Executivo Comercial” encontrou 1 anúncio e 4 leads; essa coleta direcionada exigiu pelo menos uma chamada para listar anúncios e uma para listar leads. Não foram registrados os headers de uso, o número exato de chamadas bem-sucedidas/recusadas nem o tipo completo do limite; não se deve inferir uma cota a partir desse teste.

O scheduler roda a cada 15 minutos: são **96 ciclos por dia por tenant conectado**, se todos forem concluídos. A deduplicação evita jobs repetidos para o mesmo tenant/janela, mas não limita o número de requests dentro de cada job e não agrega tenants que compartilhem a mesma conta Meta.

## 3. Estimativa por ciclo a partir do código

Os números abaixo contam requests HTTP à Graph API, não “pontos” internos de rate limit. Paginação ou limites baseados em CPU/tempo podem alterar o impacto.

| Etapa | Requests por ciclo estimados | Base do cálculo |
|---|---:|---|
| Listar campanhas | 1 no caso observado | Endpoint usa `limit=100`; 82 campanhas cabem em uma página. |
| Insights de campanhas | 1 | A rotina faz uma chamada account-level sem paginação explícita. |
| Descobrir formulários ainda desconhecidos | Pelo menos 80 no primeiro scan | Cada uma das 80 campanhas `OUTCOME_LEADS` pode chamar `/campaign/{id}/ads`; anúncios acima de 100 geram páginas adicionais. |
| Buscar anúncios e leads de campanhas com formulário | Variável: páginas de anúncios + páginas de leads por anúncio | A campanha positiva pode listar anúncios novamente; depois, cada anúncio tem sua própria consulta de leads, também paginada. |
| Instagram | Até 81 se houver 20 mídias | 1 listagem de mídias + até 4 métricas por mídia. Erros individuais são capturados e não interrompem o restante das métricas. |

Assim, **82 requests é um piso plausível para um scan inicial** das 82 campanhas (1 listagem + 1 insights + 80 verificações de formulário), antes de coletar qualquer lead ou Instagram. Se Instagram estiver conectado e retornar 20 mídias, o subtotal passa a até **163**, ainda antes da coleta de leads. O total real não pode ser calculado sem os números de anúncios, leads/páginas, mídias e headers de uso.

Com formulários cacheados, deixa de existir a chamada de descoberta para os resultados conhecidos, mas a coleta de leads continua sendo repetida em cada ciclo: lista anúncios e percorre novamente as páginas de leads dos anúncios. Upsert idempotente evita duplicação no banco, mas não economiza essas leituras da API.

## 4. O que o código controla hoje

- `metaApiCall` lê o corpo JSON e converte erro Meta para exceção, porém não lê nem persiste os headers de utilização.
- O sync identifica códigos 4 e 17 como `META_RATE_LIMIT`; se ocorrerem dentro da coleta de leads, interrompe o restante desse loop.
- Um rate limit durante insights é registrado como falha parcial, mas o run ainda pode seguir para leads. A coleta de insights do Instagram captura erros por métrica e continua tentando as próximas métricas.
- Os códigos BUC específicos documentados pela Meta não são reconhecidos como throttling global pelo pipeline atual.
- O worker tem concorrência 2 e o job ID é deduplicado por tenant/ciclo, não por `adAccountId`. Não há serialização nem orçamento distribuído por conta.
- A detecção de formulário e a leitura dos anúncios são consultas separadas ao mesmo edge `/campaign/{id}/ads`; em campanhas positivas, isso pode repetir a listagem na mesma execução.

Referências de implementação: [`meta-api.ts`](../../apps/api/src/lib/meta-api.ts), [`meta-sync.service.ts`](../../apps/api/src/services/meta/meta-sync.service.ts), [`meta-sync.worker.ts`](../../apps/api/src/workers/meta-sync.worker.ts) e [`meta-sync-manager.ts`](../../apps/api/src/lib/meta-sync-manager.ts).

## 5. Avaliação de risco

**Risco alto no primeiro scan:** até 80 verificações seriais de campanhas de leads, além de insights e listagem de campanhas, antes de conhecer os formulários. Um rate limit repetido pode deixar campanhas sem verificação; a versão atual para o loop de leads na primeira resposta 4/17, mas essa proteção ainda não cobre todos os códigos BUC nem todas as etapas do run.

**Risco recorrente de volume:** campanhas com formulário repetem a consulta de anúncios e a leitura de todas as páginas de leads a cada 15 minutos. O cache atual memoiza a existência do formulário, não um cursor de coleta ou uma janela incremental de leads.

**Precisão da estimativa:** baixa para o percentual/limite Meta e média para a estrutura do volume por ciclo. O número real depende da quantidade de anúncios e leads, paginação, tipo/tier do token, outros consumidores da mesma quota e headers que hoje não são registrados.

## 6. Recomendações

1. Instrumentar `metaApiCall` para capturar os headers de usage em sucessos e erros, registrar métricas por `adAccountId`, tipo BUC e endpoint, e nunca logar token nem payload de leads.
2. Normalizar todos os códigos/subcódigos de throttling documentados para uma condição comum, guardar o tempo de recuperação informado e interromper todas as chamadas daquela conta no run.
3. Serializar ou limitar concorrência por `adAccountId`, com estado compartilhado em Redis; tenant/job dedupe sozinho não garante proteção da quota compartilhada.
4. Tornar a coleta de leads incremental e retomável com checkpoint/cursor por anúncio e janela de reconciliação. Reutilizar a lista de anúncios obtida durante a descoberta do formulário quando possível.
5. Separar cadências/prioridades de insights, leads e Instagram. Usar um limiar preventivo configurável baseado nos headers, com margem, e backoff com jitter quando não houver estimativa de recuperação.
6. Cobrir com testes: headers ausentes/malformados, cada bucket/código de throttling, pausa por conta, retomada após reset, chamadas em concorrência e falha no meio da paginação.

## 7. Dados necessários para fechar a estimativa

Antes de definir um orçamento numérico, coletar por pelo menos alguns dias: `X-Business-Use-Case-Usage` (incluindo tipo e percentual), `X-App-Usage`/`X-Ad-Account-Usage` quando presentes, códigos/subcódigos e tempo de recuperação; requests por endpoint; quantidade de campanhas, anúncios, páginas de leads e mídias por ciclo; além do tier do app/token e outros processos que usam a mesma conta. A partir daí pode-se dimensionar o limiar preventivo sem assumir uma cota universal.
