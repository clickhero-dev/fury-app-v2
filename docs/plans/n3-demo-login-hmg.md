# [N3] Investigar erro 503 no login da conta demo em HMG

## Evidência e diagnóstico
Evento isolado reportado em 2026-11-13 14:50:06Z; associação do backend com HMG é temporal. Não é evidência de recorrência. Busca inicial de PRs abertas por `demo` não encontrou resultados.

Causa reproduzível no código: `create-demo-user.ts` cria tenant sem `isDemo`, que assume false. A migração 0056 só marca tenants novos; um tenant legado com o slug reservado permanece false e é rejeitado por AuthService.demoLogin. Não se deve remover essa proteção nem promover um tenant comercial pelo slug. O host web fornecido retornou 404 na sondagem atual; não há acesso à configuração/logs históricos de HMG nesta sessão, portanto a causa histórica permanece hipótese.

## Especificação e critérios de aceite
1. Migração aditiva idempotente marca apenas tenant ativo fashion-demo com pelo menos um usuário e todos os usuários com role demo. Preserva tenants comerciais, mistos, vazios e excluídos; não cria usuários ou sessões. Script de provisionamento cria novos tenants já marcados demo, sem imprimir senha.
2. Login mantém validação de tenant e conta ativa antes de gerar tokens. Testar sucesso, tenant ausente/não-demo, usuário ausente/inativo, falha de consulta e Redis, e recuperação por retry. Falhas não retornam tokens; nenhum provisionamento ocorre durante login.
3. Cliente usa timeout de 15 segundos e retry exclusivamente manual, mesmo quando o QueryClient global tem retry habilitado. Falha preserva ausência de sessão; resposta incompleta não deve gravar tokens. Tela apresenta mensagem já existente e permite nova tentativa.
4. Exceções backend levam environment definido por APP_ENV (hmg em HMG), fallback NODE_ENV/unknown. Telemetria não recebe configuração de credenciais. Testar precedência e fallback.

## Execução
- Escrever testes BDD pt-BR, demonstrar Red e implementar Green.
- Executar migração em PostgreSQL isolado com tabelas temporárias; testar duas execuções e limites de segurança.
- Validar suites API e web relevantes e builds; revisar diff e segredos.
- Commit e PR para hmg com título solicitado, acompanhar CI e atualizar com hmg se necessário. Sem merge/deploy ou alteração do banco HMG.

## Limitações operacionais
Reprodução isolada confirma a falha de configuração legada, mas não comprova o estado do banco no instante do evento. Após deploy autorizado separadamente, configurar APP_ENV=hmg e verificar a saúde/configuração do tenant e Redis no ambiente. Não registrar emails, senhas, tokens ou resultados de sessão nas evidências.

## Validação executada
- Red confirmado: reparação ausente, seed sem isDemo, telemetria sem environment, hook com retry herdado e ordem incorreta da migração foram detectados pelos testes antes das respectivas correções.
- Green: 16 testes API/DB/telemetria e 5 testes web direcionados.
- Migrações completas executadas com sucesso em PostgreSQL 16 isolado (porta 55439); reparação roda após seus pré-requisitos.
- Builds shared, db, API e web passaram. Warnings de bundle grande e configuração Vite preexistentes.
- Navegador Chromium contra este checkout na porta 5179: 503 mostra mensagem, não grava tokens e permite segunda tentativa manual.
- Endpoint é público e sem entrada: 401/403 por autenticação/tenant e 404 de entidade não se aplicam ao contrato; ausência de conta é intencionalmente 503. Não alterado o contrato existente.
- Revisão de diff: somente arquivos da tarefa; MCP de grafo indisponível, índice SQLite local consultado antes da leitura das implementações.
