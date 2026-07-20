# Quickstart: Restrição de Acesso

## Pré-requisitos

- Aplicação rodando (API + Web)
- Banco com plans e subscriptions seeded
- Usuário autenticado com JWT

## Cenários de validação

### 1. Bloqueio por subscription null

```bash
# Via API (simular tenant sem subscription)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/campaigns
# Esperado: 403 { code: "NO_SUBSCRIPTION" }
```

### 2. Bloqueio por trial expirado

No banco, setar `subscriptions.trial_ends_at` para data passada e `status = 'trial'`:
```sql
UPDATE subscriptions SET trial_ends_at = '2026-01-01', status = 'trial' WHERE tenant_id = '...';
```
- Frontend: recarregar → redirecionar para `/assinatura-vencida`
- API: `curl` qualquer rota protegida → 403

### 3. Rotas isentas

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/billing/plans
# Esperado: 200 com lista de planos (mesmo com subscription inválida)
```

### 4. CTA na página

Acessar `/assinatura-vencida` → ver botão/link "Ver planos" → clicar → vai para `/planos`

## Testes automatizados

```bash
pnpm run test:unit -- --testPathPattern=billing-subscription
# Esperado: all tests pass (middleware já testado)
```
