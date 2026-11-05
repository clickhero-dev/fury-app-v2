# INTRODUÇÃO
Os usuários possuem planos diferentes, e cada plano dá direito a uma quantidade X de créditos que são usados para gerar imagens.

> **Onde isso vive no banco:** o teto de créditos do plano fica em `plans.limits.creativesPerMonth`; o saldo atual da assinatura fica em `subscriptions.creatives_remaining`. Cada imagem gerada consome 1 crédito (`consumeCreativeQuota`); geração que falha devolve o crédito (`refundCreativeQuota`). `creatives_remaining = null` significa sem limite.


# COMO O CRÉDITO É RENOVADO?
Após 1 mês a contar do início da assinatura do usuário os créditos devem ser renovados.

Para isso, é necessário que um job de renovação de créditos execute.

> **Renovação mensal e automática, feita pelo job — tempo de plano E cotas.** Ao fim de cada ciclo mensal, o job renova, para TODAS as assinaturas ativas: (a) o **tempo de plano** (`current_period_end` avança +1 mês) e (b) as **cotas** (`creatives_remaining` volta ao teto do plano). Como ainda não há integração com o gateway de pagamento, a renovação NÃO verifica pagamento. A responsabilidade de desabilitar usuários que não pagaram fica com o time de negócios, que o fará manualmente (via superadmin, marcando a assinatura como `cancelled`/`inactive`).


# QUANDO O JOB DEVE SER EXECUTADO?
1. Ao iniciar a api.
2. Em intervalos de 2h. (Redundância proposital)


# FLUXO DE EXECUÇÃO DO JOB
1. Obtém todas as assinaturas que completaram o ciclo mensal:
   `status = 'active'`, `is_non_expirable = false` e `current_period_end <= now()`.
   (Trial, `past_due`, `cancelled`, `inactive` e cortesias não entram.)
2. Para cada assinatura, localiza o plano em `plans` pelo `plan_id` e lê o teto
   mensal em `plans.limits.creativesPerMonth`.
3. Se o plano tem teto definido, reseta o saldo da assinatura:
   `subscriptions.creatives_remaining = plans.limits.creativesPerMonth`.
   (Esse reset já existe em `SubscriptionRepository.resetCreativeQuota()`.)
4. Avança `subscriptions.current_period_end` para o próximo ciclo (+1 mês), para a
   mesma assinatura não ser renovada de novo no tick seguinte de 2h.
5. Assinaturas com `creatives_remaining = null` (sem limite) são ignoradas — nada a renovar.
6. Envia e-mail para o usuário informando que a cota foi renovada.


# TABELAS ENVOLVIDAS
| Tabela | Coluna | Papel na renovação |
|--------|--------|--------------------|
| `plans` | `limits` (JSONB) | Teto mensal de créditos: `limits.creativesPerMonth` |
| `plans` | `id` | Referenciado por `subscriptions.plan_id` |
| `subscriptions` | `creatives_remaining` | Saldo atual de créditos (resetado pelo job) |
| `subscriptions` | `current_period_end` | Fim do ciclo atual — gatilho da renovação |
| `subscriptions` | `status` | Filtro: só `active` renova |
| `subscriptions` | `is_non_expirable` | `true` = cortesia, sem ciclo, não renova |
| `subscriptions` | `plan_id` | Aponta o plano que define o teto |


# ESTADO ATUAL
- Reset manual já existe: `POST /api/superadmin/tenants/:tenantId/reset-quota` → `resetCreativeQuota()`.
- **Pendência:** não há job agendado (boot + 2h) — a renovação automática ainda não está ligada.
- **Pendência:** o avanço de `current_period_end` (passo 4) hoje só acontece no 1º pagamento via webhook; nos ciclos seguintes quem deve avançar é o job mensal — ainda não implementado.
