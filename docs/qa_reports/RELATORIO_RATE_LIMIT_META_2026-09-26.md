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

## 6. Exposição pelo ponto de vista de quem usa o produto

Esta classificação combina impacto do caso de uso com evidência disponível. “Exposição alta” significa que o efeito compromete uma tarefa importante quando o cenário acontece; não é uma medição de frequência em produção. A frequência real permanece desconhecida até coletarmos headers e métricas por endpoint.

| Prioridade | Caso de uso e cenário | O que a pessoa pode perceber | Exposição e evidência |
|---|---|---|---|
| **P1 — Alta** | Consultar e contatar leads da campanha em Clientes; a descoberta de formulário ou a leitura de leads falha por rate limit/permissão/paginação. | Campanha aparece sem leads ou com quantidade incompleta; contatos podem deixar de ser trabalhados no tempo esperado. | **Alta para a tarefa.** Reproduzido localmente: a campanha “Vagas Executivo Comercial” tinha 4 leads na Meta e 0 persistidos antes da coleta direcionada. O scan geral também registrou code 17 nas campanhas de leads. |
| **P1 — Alta** | Atualizar ou conferir o desempenho no Dashboard; a chamada de insights falha ou o snapshot permanece stale. | Valores podem continuar antigos; dependendo do estado inicial, o usuário pode interpretar ausência de dados como desempenho zero ou não atualizado. | **Média/alta.** O serviço persiste resultados parciais e serve snapshots. Não temos uma série de uso nem telemetria que determine por quanto tempo os dados ficam stale em produção. |
| **P2 — Média** | Avaliar métricas orgânicas no Dashboard; o rate limit atinge uma das métricas do Instagram. | Algumas métricas podem aparecer como `0`, indistinguíveis de um zero real, porque falhas individuais são absorvidas e os campos começam zerados. | **Média.** Confirmado pelo caminho de implementação; não foi reproduzido visualmente como incidente nessa validação. |
| **P2 — Média** | Abrir Clientes pela primeira vez, antes de existir snapshot local. | A página ainda pode esperar a sincronização inline da Meta para popular a primeira lista. | **Média, condicional.** O caminho sem snapshots continua inline. Com snapshots existentes, as rotas agora retornam o cache e enfileiram refresh; localmente responderam em 15 ms (`/leads`) e 33 ms (`/lead-campaigns`). |
| **P2 — Média** | Abrir Clientes com snapshot existente, mas antigo ou incompleto. | A tela carrega rápido, mas pode não mostrar imediatamente campanhas/leads recém-criados; a atualização ocorre em segundo plano. A página descreve os dados como “buscados direto do Meta Ads”, sem exibir idade/estado stale junto aos leads. | **Média, condicional à falha ou demora do job.** É o compromisso stale-while-revalidate: menor espera em troca de possível defasagem temporária, que pode não ficar clara para quem usa. |
| **P1 — Alta** | Várias conexões/tenants usam a mesma conta de anúncios ou o usuário já consome quota em outros apps. | Um sync pode reduzir a disponibilidade de chamadas para a própria conta e atrasar outras tarefas ligadas à Meta. | **Potencialmente alta e compartilhada.** Jobs são deduplicados por tenant, não por conta; o worker pode processar dois jobs ao mesmo tempo. Não temos mapeamento de contas compartilhadas nem dados de headers para medir esse alcance. |

### Bugs e lacunas que podem produzir esses efeitos

- **Perda silenciosa de leads**: um resultado `false` não verificado era indistinguível de formulário inexistente; isso já foi corrigido usando `NULL` como estado desconhecido e uma migração. A coleta da campanha-alvo recuperou os quatro leads.
- **Cache negativo sem revalidação**: depois que `has_lead_form=false` é confirmado, o sync deixa de consultar a campanha. Se o estado dos anúncios/criativos mudar e um formulário for adicionado posteriormente, a campanha pode continuar sem leads até uma reconciliação explícita; o snapshot não tem TTL/versionamento para esse resultado.
- **Varredura ampla interrompida por quota**: campanhas desconhecidas são verificadas serialmente; no primeiro rate limit durante o loop de leads, o código agora para esse loop. Ainda não há retomada por cursor nem gestão do tempo de recuperação.
- **Throttle não reconhecido em todos os caminhos**: apenas códigos 4 e 17 são normalizados como `META_RATE_LIMIT`. Insights pode falhar e o fluxo continuar para leads; falhas de insights individuais do Instagram são absorvidas, com zero como fallback. Códigos BUC específicos também não são tratados como interrupção global.
- **Leitura repetida de histórico**: em cada ciclo, campanhas com formulário voltam a listar anúncios e todas as páginas de leads por anúncio. Isso pode aumentar latência e consumo sem alterar o resultado no banco, pois upsert idempotente não reduz requests de leitura.
- **Dado stale apresentado como atual**: a tela de Clientes prioriza resposta rápida servindo o snapshot e atualizando em background. Se o job falhar, o usuário pode continuar vendo dado antigo; a descrição atual sugere consulta direta à Meta e a resposta usada pela tela não expõe idade/estado stale no componente de Clientes, então a defasagem pode passar despercebida.

### Sinais de produto recomendados

Para medir impacto real, além da telemetria de quota, monitorar: idade do snapshot exibida ao usuário; proporção de campanhas com leads na Meta vs. leads persistidos; idade desde o último sync bem-sucedido; campanhas/leads adicionados por ciclo; tempo de carregamento da primeira lista; taxa de runs parciais por tipo de erro; e tempo de recuperação após rate limit. Alertas devem ser baseados em atraso e falhas persistentes, não em um único run parcial.

## 7. Recomendações

1. Instrumentar `metaApiCall` para capturar os headers de usage em sucessos e erros, registrar métricas por `adAccountId`, tipo BUC e endpoint, e nunca logar token nem payload de leads.
2. Normalizar todos os códigos/subcódigos de throttling documentados para uma condição comum, guardar o tempo de recuperação informado e interromper todas as chamadas daquela conta no run.
3. Serializar ou limitar concorrência por `adAccountId`, com estado compartilhado em Redis; tenant/job dedupe sozinho não garante proteção da quota compartilhada.
4. Tornar a coleta de leads incremental e retomável com checkpoint/cursor por anúncio e janela de reconciliação. Reutilizar a lista de anúncios obtida durante a descoberta do formulário quando possível.
5. Separar cadências/prioridades de insights, leads e Instagram. Usar um limiar preventivo configurável baseado nos headers, com margem, e backoff com jitter quando não houver estimativa de recuperação.
6. Cobrir com testes: headers ausentes/malformados, cada bucket/código de throttling, pausa por conta, retomada após reset, chamadas em concorrência e falha no meio da paginação.

## 8. Dados necessários para fechar a estimativa

Antes de definir um orçamento numérico, coletar por pelo menos alguns dias: `X-Business-Use-Case-Usage` (incluindo tipo e percentual), `X-App-Usage`/`X-Ad-Account-Usage` quando presentes, códigos/subcódigos e tempo de recuperação; requests por endpoint; quantidade de campanhas, anúncios, páginas de leads e mídias por ciclo; além do tier do app/token e outros processos que usam a mesma conta. A partir daí pode-se dimensionar o limiar preventivo sem assumir uma cota universal.
