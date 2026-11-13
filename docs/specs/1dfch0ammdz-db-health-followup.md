# 1dfch0ammdz — plano de conclusão do health do banco

## Especificação e critérios

1. O processo HTTP deve iniciar antes das migrations, executar o probe e as migrations no workflow, manter o health acessível e recusar as demais rotas até o bootstrap terminar. Falhas terminais devem manter diagnóstico por 10 segundos e encerrar com código 1; o supervisor deve reiniciar o processo.
2. O health deve classificar indisponibilidade, timeout e erro de consulta sem publicar mensagens brutas do driver. Falhas de migration devem expor apenas uma mensagem fixa, inclusive em logs e erros do workflow. Testar com uma URL contendo senha.
3. Eventos de falha e recuperação devem conter serviço, ambiente validado, categoria e tentativa sem credenciais; configurar APP_ENV nos serviços reais e confirmar os eventos em HMG e produção.
4. O probe deve cancelar consultas após 10 segundos, limitar tentativas a três e não iniciar workers antes do bootstrap. Validar indisponibilidade e recuperação com PostgreSQL real. Avaliar capacidade total do pool considerando réplicas e limites do banco antes de modificar parâmetros; 10 conexões por processo não representa limite global.
5. Obter os seis eventos individuais do PostHog, correlacionar timestamps em UTC com logs do serviço, banco e infraestrutura e registrar evidências ou ausência delas por ocorrência. Não inferir origem com base apenas na mensagem.
6. Atualizar com hmg, conciliar a alteração concorrente da PR #427, executar testes, conferir os checks no SHA final e validar restart e health no ambiente de homologação.

## Evidências e pendências

A PR #401 contém a implementação original. Nesta continuação, o health de migration e o erro propagado são sanitizados e o Docker deixa o workflow executar migrations após abrir o listener. Testes cobrem a configuração de entrada da imagem e a resposta pública com credenciais no erro simulado.

Os valores atuais do pool são max=10 por processo, idle_timeout=20 s, connect_timeout=10 s e prepare=false; o deadline do probe também é 10 s. O cancelamento e a recuperação do pool foram exercitados no relatório anterior, mas não há evidência da capacidade disponível, número de réplicas ou limites de conexão necessários para afirmar que o dimensionamento é seguro. Não alterar esses valores sem essa informação.

O log da tentativa mais recente de jornada-real no SHA 5ccf879 mostra login bem-sucedido e timeout de 20 minutos aguardando o botão Gerar Conversas, não uma falha de DNS. A execução usa o backend remoto de HMG e não comprova o comportamento do backend desta branch. A configuração real de APP_ENV, a política de reinício, o teste em HMG e a correlação histórica permanecem sem evidência e exigem acesso aos respectivos serviços.

## Integração com a base de 13/11

- Preservar o worker de planos do chatbot: iniciá-lo apenas após probe, migrations e seed bem-sucedidos; manter o encerramento no SIGTERM. Aceite: teste de integração do bootstrap e build da API passam.
- Preservar todas as migrations já registradas nas duas branches, incluindo `0063_ady_rbac_plan_views_blocked` e as migrations do chatbot; validar o conjunto integrado e o CI do SHA resultante.
- Manter a PR em rascunho até correlacionar as seis ocorrências e comprovar APP_ENV, capacidade do pool, funcionamento em HMG e restart pelo supervisor. A PR #427 continua aberta e deve ser reconciliada novamente caso seja integrada primeiro.
