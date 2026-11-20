# Revalidação E2E — 1dfch0ammdz — 18/11/2026

A PR #475 (head anterior `e66a457d`) foi integrada à base `hmg` `25a28408`. A integração não produziu conflitos textuais. A base incorporou a correção do teste de recuperação de planos que falhava no CI anterior; não houve alteração de produção adicional nesta revalidação.

## Evidências locais

- Build de `@fury/shared`, `@fury/db` e `@fury/api`: sucesso.
- Sete suítes de health, gate, Docker e bootstrap: 19 testes passaram. PostgreSQL 16 descartável confirmou cancelamento de `pg_sleep(60)` e reutilização do pool; processo real confirmou health crítico e saída 1 com banco indisponível.
- Integração do worker de planos com PostgreSQL 16 e Redis 7 descartáveis: três testes passaram, inclusive recuperação após esgotar tentativas. A base parou os workers antes de simular o crash e ajustou o estado às tentativas efetivamente esgotadas.
- O CI do head anterior passou nos builds e testes unitários. A jornada real falhou com cota de imagens de HMG esgotada (20/20); criou e limpou uma campanha. Não foi repetida sem mudança da cota. A falha anterior do chatbot foi exercitada localmente após a atualização da base. Os checks do novo commit devem ser avaliados separadamente.

## Pendências e limites

Os seis eventos históricos não foram correlacionados: faltam eventos individuais e logs. Permanecem sem evidência a configuração real de `APP_ENV`, capacidade e réplicas para dimensionamento do pool, teste controlado em HMG, reinício pelo supervisor e ausência de perda de jobs em ambiente real. A PR #427 continua aberta e exigirá reconciliação se integrada primeiro. Não há base para declarar todos os critérios do card atendidos nem a PR pronta para merge. A jornada real usa backend remoto e não valida o backend desta branch. A cota de HMG precisa ser restabelecida antes de reexecutá-la.
