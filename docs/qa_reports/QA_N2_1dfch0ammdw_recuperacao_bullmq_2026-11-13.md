# QA — recuperação Redis/BullMQ do worker Meta

Card: https://app.clickup.com/t/1dfch0ammdw  
PR: https://github.com/clickhero-dev/fury-app-v2/pull/436  
Base de teste: `4650faf6`, reconciliada com `hmg` `2cb07532`.

## Problema e correção

O consumidor BullMQ deixava de processar após uma interrupção superior às dez reconexões, embora parecesse estar em execução. A conexão compartilhada com o BullMQ herdava a estratégia finita do cliente Redis central. A conexão de longa duração passa a reconectar continuamente, com backoff de 200 ms a 2 s; a conexão central mantém dez tentativas e a espera de startup de 25 s. O teste de integração foi incluído no CI.

## Evidências

Com Redis 7 em container isolado e BullMQ reais, o teste consome um job, interrompe o Redis abruptamente por 15 s, o reinicia na mesma porta e verifica o consumo após a recuperação. No código original, falhou porque o job posterior não foi consumido; com a alteração, passou. O teste utiliza consumidor sintético, não o processador Meta. Uma primeira versão do teste usava uma porta dinâmica que mudava ao reiniciar o container; foi corrigida para manter a mesma porta.

Os cinco arquivos de teste existentes mais o teste de recuperação passaram (35 testes). O build local da API não concluiu porque o worktree isolado não possui dependências de workspace como `zod`; o build do CI deve ser consultado no novo commit. A deduplicação não garante exactly-once e o teste não comprova durabilidade de jobs sob perda abrupta nem persistência do Redis real.

## Pendências operacionais

Não houve acesso ao EasyPanel, credenciais ou logs de HMG/produção. A configuração efetiva de `REDIS_URL`, topologia, política de reinício, conectividade e uma sincronização Meta real após recuperação não foram verificadas. O health registra startup, não saúde contínua. Nenhum deploy foi feito. A jornada-real anterior falhou por cota mensal de imagens esgotada e usa a API HMG já implantada; não demonstra o backend desta branch. A PR permanece em rascunho até que os checks e as verificações operacionais sejam concluídos. A #435 altera arquivos de health relacionados e precisa ser reconciliada conforme a ordem de integração.
