# QA — login demo em HMG (1dfch0anarb)

Referência: PR #464, base hmg, implementação 741148d6. Validação independente em 17/11/2026.

- Playwright Chromium com API simulada: 503 apresenta mensagem e mantém token, refresh token e usuário ausentes; uma tentativa manual posterior autentica, com exatamente duas chamadas. Teste automatizado em `apps/web/e2e-mock/demo-login-recovery.spec.ts`. Passou 1/1. Não equivale a E2E com backend real.
- Vitest API, seed, telemetria e migração: 13/13 em PostgreSQL 16 isolado. A primeira execução falhou por ausência de PostgreSQL local na porta 5432; repetida com container temporário na 55439 passou. Testes incluem idempotência, limites de segurança, ausência de conta, falha de consulta/Redis e recuperação.
- Vitest web: 5/5, incluindo timeout simulado, resposta incompleta e retry manual. Timeout real de rede não foi exercitado no navegador.
- API HMG respondeu HTTP 503 `DEMO_UNAVAILABLE` na sondagem direta, sem registrar sessão ou credenciais. O estado do banco e configuração HMG não foram acessíveis; causa histórica e correção implantada não foram comprovadas. O código demonstra uma condição legada possível, não a causa confirmada do evento.
- GitHub: PR mergeável sem conflitos; build API, build web, testes e Chatbot verdes no head 741148d6. Jornada real falhou por cota de imagens da conta QA esgotada (20/20), após login, criação, pausa e limpeza de campanha. Não alteramos cota ou workflow. https://github.com/clickhero-dev/fury-app-v2/actions/runs/44193640843
- Pendências: restaurar capacidade de teste de imagens da conta QA e obter jornada real verde; após disponibilização da correção em HMG, validar configuração/saúde e login demo real, inclusive ambiente da telemetria. Até então não é possível atestar PR totalmente pronta nem todos os critérios de aceite.
