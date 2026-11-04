# Runbook: interface assíncrona e estados de carregamento

## Sinais

- Um carregamento lento aparece como lista vazia ou erro genérico.
- A tela continua em skeleton/recuperação depois que a operação terminou.
- Ao trocar filtro ou período, a tela mistura dados antigos com novo contexto.

## Diagnóstico

1. Compare estado de requisição (`pending`, `success`, `error`) e resposta vazia.
   Coleção vazia só é válida após sucesso explícito.
2. Em tela de dado cacheado, compare o horário do snapshot com o estado de refresh.
   Um refresh defasado não deve apagar o dado que o usuário ainda pode usar.
3. Para jobs, confira estado terminal persistido antes de manter uma tela de
   recuperação ou polling.
4. Reproduza troca rápida de período/filtro e verifique se respostas antigas são
   descartadas ou associadas ao contexto correto.

## Mitigação

- Mostre erro acionável quando a requisição falhar; não converta a falha em vazio.
- Preserve dado válido durante refresh e apresente indicador não bloqueante de
  atualização/desatualização.
- Pare polling e recuperação quando o job atingir estado terminal.

## Correção definitiva e prevenção

- Modele estado de rede separadamente do dado e cubra sucesso, vazio, pendência,
  falha e troca de contexto nos testes de componente.
- Para dados Meta cacheados, consuma `degraded`/`syncedAt` como informação de UI,
  sem retornar ao endpoint externo legado.
- Use tokens semânticos de tema e teste os dois temas quando alterar estados,
  alertas ou componentes de carregamento.

## Evidências no histórico

- `9236bd1` — distinção entre falha de carregamento e resultado vazio.
- `390296f` — skeleton ao trocar período no dashboard.
- `65accb1` — cobertura para falha e consultas pendentes.
- `07874fa` — recuperação encerrada ao observar job terminal.
- `1b43e11` — aviso de atualização Meta suavizado no frontend.

## Critério de encerramento

Usuários distinguem vazio, carregamento, erro e dado defasado. Trocas rápidas não
exibem resultado de contexto anterior e um job terminado não bloqueia a navegação.
