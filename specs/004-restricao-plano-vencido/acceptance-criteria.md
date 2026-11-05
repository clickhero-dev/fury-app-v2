# Acceptance Criteria: Restrição de Acesso por Plano Vencido/Sem Plano

### CA-01: Trial Vencido (FR-001)
- [ ] **Dado** um usuário com subscription status `trial` e `trialEndsAt` no passado
  **Quando** ele tenta acessar qualquer rota protegida
  **Então** o frontend redireciona para `/assinatura-vencida`
- [ ] **Dado** um usuário com subscription status `trial` e `trialEndsAt` no futuro
  **Quando** ele acessa o dashboard
  **Então** o acesso é permitido normalmente
- [ ] **Dado** um usuário com trial expirado tenta chamar uma rota de API protegida
  **Quando** o middleware `checkSubscriptionActive` está ativo
  **Então** a API retorna 403 com código `TRIAL_EXPIRED`

### CA-02: Plano Vencido (FR-001)
- [ ] **Dado** um usuário com status `cancelled`
  **Quando** acessa o app
  **Então** é redirecionado para `/assinatura-vencida`
- [ ] **Dado** um usuário com status `inactive`
  **Quando** acessa o app
  **Então** é redirecionado para `/assinatura-vencida`
- [ ] **Dado** um usuário com status `past_due`
  **Quando** acessa o app
  **Então** é redirecionado para `/assinatura-vencida`
- [ ] **Dado** um usuário com status `active` e `currentPeriodEnd` no passado
  **Quando** acessa o app
  **Então** é redirecionado para `/assinatura-vencida`

### CA-03: Sem Subscription (FR-002)
- [ ] **Dado** um usuário recém-cadastrado sem subscription
  **Quando** ele tenta acessar qualquer rota protegida (exceto `/planos`, `/assinatura`, `/assinatura-vencida`)
  **Então** o sistema redireciona para `/assinatura-vencida`
- [ ] **Dado** um usuário sem subscription
  **Quando** ele acessa `/planos`
  **Então** a página de planos é exibida normalmente

### CA-04: Rotas Isentas (FR-003, FR-007)
- [ ] **Dado** um usuário com status `past_due`
  **Quando** ele acessa `/planos`
  **Então** a página carrega normalmente
- [ ] **Dado** um usuário sem subscription
  **Quando** ele acessa `/assinatura`
  **Então** a página informa que não há assinatura ativa e oferece para ver planos
- [ ] **Dado** um usuário com trial expirado
  **Quando** ele acessa `/assinatura-vencida`
  **Então** a página exibe as informações de contato e a opção de renovar

### CA-05: API Gate (FR-004, FR-005)
- [ ] **Dado** um usuário sem subscription
  **Quando** chama uma rota de API protegida
  **Então** o middleware retorna 403 com código `NO_SUBSCRIPTION`
- [ ] **Dado** um webhook Asaas (`POST /billing/webhook`)
  **Quando** chega uma requisição
  **Então** não passa por verificação de subscription

### CA-06: CTA Reassinar (FR-006)
- [ ] **Dado** um usuário na página `/assinatura-vencida`
  **Quando** a página carrega
  **Então** exibe um CTA/link para `/planos`
