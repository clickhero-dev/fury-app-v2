# SPEC — Conta demo isolada

Prioridade: N2. A solução usa o atributo persistido `users.role = 'demo'` e um tenant exclusivo, sem parâmetro de frontend para ativar o modo.

## Estratégia

1. A migration adiciona o role `demo`; `packages/db/src/create-demo-user.ts` cria `demo@fury.test` (ou `DEMO_EMAIL`) em tenant `fashion-demo`, uma assinatura `Demo` ativa, gratuita e `is_non_expirable`.
2. O JWT já carrega role e tenant do usuário autenticado. O middleware de tenant continua usando somente esse tenant; a isenção de expiração é limitada a `role === 'demo'` no backend.
3. O shell reconhece o role recebido na sessão e pula apenas os gates de onboarding/conexão Meta e vencimento. A política de uso permanece válida.
4. Os endpoints `/api/v2` retornam fixtures determinísticas antes de repositórios, filas ou Meta quando o role é demo. Os dados incluem campanhas, detalhes, métricas diárias, dashboard, Instagram, metas e leads; `demo: true` é observável na resposta.
5. Requests não-demo preservam o fluxo existente tenant-bound, inclusive repositório, sincronização e Meta.

## Cenários de teste

- Demo autentica e chega ao dashboard sem consulta à conexão Meta/onboarding.
- Demo não consulta assinatura comercial nem bloqueia por vencimento.
- Dashboard/listagem/detalhe retornam números positivos e coerentes, sem repositório ou enfileiramento Meta.
- Um role não-demo mantém o caminho tenant-bound normal.
- ID de campanha/lead demo inexistente retorna 404; atributos enviados pelo frontend não ativam demo.

## Decisões e limites

- Fixtures são código explícito, sem persistência e sem fallback a dados reais.
- A criação do usuário falha se o e-mail escolhido já for de uma conta não-demo, evitando reclassificação acidental.
- Ações de alteração de lead demo retornam resposta simulada e não escrevem no banco.
