# Sincronização Meta: cache-first e refresh stale

## Decisões

- Clientes, Dashboard e Campanhas leem primeiro os snapshots persistidos no banco.
- Dados com até 3 horas são servidos normalmente. Acima desse limite, a API marca a resposta como degradada e enfileira um refresh em background.
- Alterações feitas no Ady (criação, pausa, retomada, edição de nome/orçamento e arquivamento) atualizam o snapshot v2 depois da confirmação da Meta e da persistência local. A lista é invalidada no frontend após a mutação.
- Alterações feitas diretamente na Meta aparecem no ciclo periódico seguinte, agendado a cada 15 minutos, mais o tempo de fila e processamento. A tela mostra o snapshot existente até a próxima consulta.
- A interface mantém os dados disponíveis durante o refresh, mostra um aviso e atualiza o conteúdo depois que uma nova sincronização for persistida. Na primeira sincronização, mostra estado de preparação em vez de afirmar que não há dados.
- Métricas de campanha são guardadas por dia para respeitar filtros de período. A série de 30 dias é atualizada no máximo uma vez por dia, reduzindo paginação e chamadas à Meta.
- Ao detectar throttling, a sincronização interrompe as chamadas Meta restantes daquele run. Os headers de uso são registrados para observabilidade.

## Fluxo

1. A tela solicita o endpoint v2.
2. A API lê os dados do banco e calcula `syncedAt` e `degraded`.
3. Se os dados tiverem mais de 3 horas, a API agenda um único job stale por tenant; não chama a Meta durante a requisição da tela.
4. O worker sincroniza e persiste snapshots e métricas diárias. A interface consulta novamente enquanto a resposta estiver degradada.
5. Quando um novo run válido é persistido, a API atualiza o estado de sincronização e a interface apresenta os dados novos.
6. Em mutações iniciadas no Ady, a API grava a alteração confirmada diretamente no snapshot v2; a invalidação da query faz a tela buscar esse estado sem aguardar o cron. Se a projeção falhar, a ação continua como sucesso e uma reconciliação é enfileirada.

## Limites atuais

O refresh do snapshot após ações do Ady é imediato; ações externas à aplicação dependem do cron de 15 minutos e da próxima consulta da tela. A escrita de projeção falha de forma eventual e usa o sync completo como reconciliação. Lock/cooldown distribuído por conta e checkpoint incremental de leads ainda precisam ser implementados; a coleta de leads continua percorrendo o histórico dos anúncios nos ciclos de sincronização.

## Validação desta alteração

Testes direcionados de API e Web cobrem a projeção imediata, a preservação das métricas, a invalidação da lista e a reconciliação em caso de falha. Ver [ADR-0003](../adr/0003-meta-async-sync-v2.md) para contexto e decisões completas.
