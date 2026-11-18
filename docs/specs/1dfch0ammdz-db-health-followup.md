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

## Plano de verificação operacional e reconciliação de 18/11

1. Exportar os seis eventos individuais do PostHog com IDs e timestamps UTC; para cada um, consultar logs do backend, banco e plataforma na mesma janela e registrar serviço, ambiente e causa apenas quando houver correlação verificável. Aceite: seis registros com evidência ou lacuna explicitada; não inferir a origem pelo texto da consulta.
2. Identificar os serviços e réplicas reais; conferir `APP_ENV` em cada backend sem registrar segredos. Validar em HMG que um evento de falha e um de recuperação carregam serviço, ambiente e categoria, sem mensagens do driver ou credenciais. Aceite: evidências sanitizadas por ambiente.
3. Obter limites de conexão, reserva administrativa e número máximo de processos; comparar a soma dos limites de pool por processo com a capacidade disponível. Medir latência de conexão e cancelamento para avaliar os prazos iguais de 10 s. Aceite: dimensionamento e margens documentados com fontes, ou ajuste acompanhado de testes.
4. Em homologação, simular indisponibilidade e recuperação de forma controlada, observar health, filas e reinício automático pelo supervisor. Aceite: health crítico durante a janela, saída 1, reinício comprovado, retomada dos jobs e ausência de perda silenciosa.
5. Integrar a base `hmg`, preservar ambas as variáveis de CI do conflito e os workers de chatbot após o bootstrap. Reavaliar a PR #427 se ela for integrada; executar testes focados, builds e todos os checks do SHA final. Aceite: PR sem conflitos e CI verde no SHA atual.

Em 18/11, `hmg` avançou e a #435 passou a apresentar conflito no workflow de CI. A reconciliação preserva `PROBE_E2E_DATABASE_URL` e `TEST_RATING_DATABASE`; o worker de recuperação de turnos incorporado pela base permanece após `startupReady`. A #427 segue aberta. O acesso a PostHog e aos logs/configurações dos serviços não está disponível nesta sessão; os passos 1–4 continuam pendentes e não se deve concluir o card com base apenas em testes locais ou CI.
