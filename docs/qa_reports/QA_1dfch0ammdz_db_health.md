# QA — saúde da conexão com o banco (1dfch0ammdz)

PR #401; base `hmg`. Avaliação realizada em ambiente isolado com PostgreSQL 16 e Redis 7, sem acesso aos serviços de produção.

## Problemas reproduzidos e correções

- A exceção do emissor de telemetria substituía a falha do banco e impedia a recuperação. Teste primeiro reproduziu a falha; a emissão foi isolada do fluxo de readiness.
- As rotas públicas de LP e brand kit, assim como rotas fora de `/api`, passavam antes do gate. Testes HTTP com a aplicação real reproduziram respostas 500/200 durante startup; o gate foi movido para antes das rotas, preservando o health.
- Após três tentativas falhas, o listener era fechado imediatamente. Um teste de processo reproduziu a ausência de resposta; o bootstrap mantém o health crítico acessível e o processo encerra com código 1 após a janela de diagnóstico. Outras falhas terminais de bootstrap também acionam saída crítica.
- O probe não tinha prazo para consulta pendurada. Foi adicionado prazo de 10 segundos e cancelamento pelo driver, com teste de relógio e teste contra PostgreSQL real: `pg_sleep(60)` foi cancelado e uma consulta posterior no pool foi bem-sucedida.
- SQLSTATE alfanumérico `42P01` era classificado como desconhecido. Um teste reproduziu e a classificação foi corrigida.
- A branch foi integrada localmente com a versão atual de `hmg`, sem conflitos textuais. O teste de cancelamento real foi incluído no job de cobertura do CI.

## Evidência e limites

- `npm run test:unit`: 250 testes passaram, com PostgreSQL/Redis isolados.
- Testes focados de health, gate e inicialização passaram. O teste de processo observou health `critical` e saída 1; o teste PostgreSQL observou cancelamento e consulta posterior bem-sucedida.
- As seis ocorrências históricas informadas no card não possuem aqui os timestamps individuais ou acesso aos eventos PostHog e logs de infraestrutura. Origem e ambiente de cada ocorrência permanecem **indeterminados**; não se pode afirmar que vieram deste probe.
- CI remoto e cobertura completa devem ser conferidos para o commit final; homologação e política de reinício do supervisor não foram verificadas.
- No teste de recuperação com processo real, a API iniciou com conexão recusada, expôs `unavailable`, e passou a `healthy` após um proxy TCP isolado restabelecer acesso ao banco antes da terceira tentativa; Redis e banco eram exclusivos do teste.
- O log remoto do CI anterior foi recuperado: a cobertura terminou com 12 arquivos falhos e nove testes falhos; os testes de rotas recebiam 503 porque a aplicação importada nos fixtures não havia passado pelo startup. Um fixture explícito de aplicação pronta corrigiu o cenário reproduzido em `studio-asset-detail` (nove falhas antes, nove sucessos depois). Os testes específicos de startup continuam usando a aplicação sem esse fixture.
