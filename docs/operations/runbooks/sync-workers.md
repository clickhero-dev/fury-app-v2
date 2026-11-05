# Runbook: sincronização, cache e workers

## Sinais

- Campanhas, leads ou métricas estão defasados, mas há snapshot anterior.
- Uma conta Meta falha durante a sincronização e afeta a execução de outras.
- A fila cria jobs repetidos ou um worker continua ativo após shutdown.

## Diagnóstico

1. Leia o último `meta_sync_runs`: status, `partial_failures`, horário de
   sincronização e escopo/conta afetados.
2. Compare `syncedAt` e `dataThrough` com o limiar de degradação de três horas.
   Dado Meta pode ser D-1 sem que a sincronização esteja falhada.
3. Confirme que existe um único job ativo para o tenant/conta e janela de execução.
4. Para falha parcial, isole a conta/campanha que falhou; não descarte o snapshot
   das demais nem derrube a lista inteira.

## Mitigação

- Mantenha o snapshot persistido visível, sinalize que ele está desatualizado e
  enfileire uma atualização deduplicada.
- Reexecute somente o escopo falho depois de validar credenciais e disponibilidade
  do provedor. Não dispare um fanout manual de todos os tenants.
- Em shutdown, encerre workers e filas antes de desconectar Redis.

## Correção definitiva e prevenção

- Use `jobId` determinístico, lock por conta e upserts idempotentes tenant-bound.
- Retorne envelope com `data` e `partial_failures`; os motivos devem ser seguros
  para o cliente e a falha parcial deve gerar telemetria.
- Separe leitura da tela da chamada externa: leituras consultam snapshot e o
  refresh ocorre fora da requisição do usuário.
- Teste sucesso, falha parcial, timeout, credencial expirada, erro total, dedupe
  e fechamento do worker.

## Evidências no histórico

- `405b921` — endpoints v2 com fallback para snapshot defasado.
- `8f2efdb` — dedupe por conta, confiabilidade do scheduler e observabilidade.
- `179748f` — telemetria, sanitização e isolamento de cache.
- `c8eb0d9` — cache-first com refresh gracioso.
- `7a32634` — encerramento do worker de status de leads.

## Critério de encerramento

O usuário continua vendo o último dado válido com aviso apropriado, não existem
jobs duplicados para o mesmo escopo e o erro aparece em telemetria sem dados
sensíveis. O próximo ciclo bem-sucedido remove o aviso.
