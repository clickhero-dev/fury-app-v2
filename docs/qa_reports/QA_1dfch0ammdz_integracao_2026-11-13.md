# QA — health do banco e integração com hmg — 13/11/2026

Card: 1dfch0ammdz. PR #435, continuação da #429; base hmg `2cb0753234ae55400a3eef8ad758c9b83a8e8e1f`, head inicial `db6436dca595b04c1b62442bd0d1ee63112f21c9`. A #435 contém o merge de hmg e o GitHub informou MERGEABLE; a #429 anterior permanece conflitante. A #435 está em rascunho devido às pendências operacionais abaixo.

## Problemas encontrados e resolução

- O CI `test-unit` falhou em `plan-views.integration.test.ts`: os endpoints de registro e login retornaram 503, pois a suíte nova na base importava a aplicação em estado de inicialização. Reproduzido com PostgreSQL 16 e Redis 7 isolados. A suíte agora usa o fixture `ready-app`, apropriado para testes funcionais após o bootstrap. O teste original passou após a mudança; o teste específico de gate continua usando a aplicação original.
- O job Chatbot falhou no E2E real: o log da API mostrava 503 para conversas e demais rotas. O servidor E2E próprio do chatbot importa a aplicação em NODE_ENV=test, sem executar o bootstrap; foi ajustado para usar o mesmo fixture de aplicação pronta, depois de o gate de CI provisionar as dependências. O E2E real existente é a verificação da integração no CI.

## Evidências locais

- PostgreSQL 16 e Redis 7 exclusivos; migrations aplicadas a banco descartável.
- Cinco suítes (planos, gate HTTP, health, classificação/probe, entrada Docker): 28 testes aprovados. Antes da alteração a suíte de planos falhou com 503 e 12 testes não executados.
- Duas suítes E2E adicionais: 2 testes aprovados, incluindo cancelamento real de consulta longa e reutilização do pool, e processo real com banco indisponível, health critical e saída 1.
- Builds de shared, db e API aprovados; `git diff --check` sem erros. O CI remoto deve ser consultado no commit final.

## Limitações

A correlação das seis ocorrências históricas com timestamps e logs de infraestrutura não está comprovada. Também faltam evidências da configuração real de APP_ENV, capacidade/réplicas para dimensionar o pool, homologação da implementação e política de restart. A jornada real geral do CI usa backend remoto, não o backend da branch. A #427 permanece aberta e altera o mesmo bootstrap; conferir integração após qualquer merge concorrente. Essas pendências não são resolvidas pelo teste local nem pela ausência de conflitos e impedem declarar todos os critérios do card atendidos.
