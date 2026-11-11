# Investigação das falhas de SELECT 1

O relatório PostHog de 07/10/2026 18:44 a 06/11/2026 18:44 BRT informa seis ocorrências, duas nos últimos sete dias. Não inclui timestamps individuais, IDs dos eventos, serviço ou ambiente. Não havia acesso aos eventos individuais nem aos logs de infraestrutura nesta investigação. Assim, para cada uma das seis ocorrências, horário exato, origem, serviço, ambiente e causa permanecem indeterminados. Não há evidência suficiente para afirmar que qualquer uma veio do probe de startup.

Para concluir a correlação histórica, consultar os seis eventos originais com seus IDs e timestamps, convertê-los para UTC e buscar a mesma janela nos logs de API, workers e banco em cada ambiente; registrar evidência ou ausência de correspondência por evento. Os novos eventos do probe incluem serviço e ambiente (NODE_ENV permitido por lista, ou unknown), categoria, tentativa e latência, sem mensagem ou credenciais.
