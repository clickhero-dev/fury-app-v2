# Feature Specification: Restrição de Acesso por Plano Vencido/Sem Plano

**Feature Branch**: `feat/restricao-plano-vencido`

**Created**: 2026-07-20

**Status**: Draft

**Input**: Planos existem na aplicação, no banco de dados. É preciso que um usuário tenha somente um dos planos. Se o plano estiver vencido, ou sem plano, ele deve ser redirecionado para uma página dizendo que o plano dele acabou.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Redirecionamento por Trial Vencido (Priority: P1 🎯 MVP)

Um usuário que estava em período de teste (trial) de 7 dias tem o trial expirado. Ao tentar acessar qualquer página da aplicação, ele é imediatamente redirecionado para `/assinatura-vencida`, onde vê uma mensagem clara de que o acesso foi bloqueado e os canais de suporte.

**Why this priority**: Já existe implementação parcial, mas sem a camada de middleware no backend e sem tratar o caso de "sem plano". Bloqueia vazamento de funcionalidades para usuários não pagantes.

**Independent Test**: Um usuário com trial expirado há 1 dia tenta acessar o dashboard e é redirecionado para `/assinatura-vencida` em menos de 2 segundos, sem conseguir navegar para outras rotas.

**Acceptance Scenarios**:

1. **Given** um usuário com subscription status `trial` e `trialEndsAt` no passado, **When** ele tenta acessar qualquer rota protegida, **Then** o frontend redireciona para `/assinatura-vencida`.
2. **Given** um usuário com subscription status `trial` e `trialEndsAt` no futuro, **When** ele acessa o dashboard, **Then** o acesso é permitido normalmente.
3. **Given** um usuário com trial expirado tenta chamar uma rota de API protegida, **When** o middleware `checkSubscriptionActive` está ativo, **Then** a API retorna 403 com código `TRIAL_EXPIRED`.

---

### User Story 2 — Redirecionamento por Plano Vencido (Priority: P1 🎯 MVP)

Um usuário com assinatura paga que não renovou (status `past_due`, `cancelled`, `inactive` ou `active` com `currentPeriodEnd` passado) é redirecionado para `/assinatura-vencida` ao tentar usar a aplicação.

**Why this priority**: Mesmo mecanismo do trial vencido — a perda de acesso é o comportamento esperado para qualquer plano não renovado.

**Independent Test**: Um usuário com subscription status `past_due` há 5 dias tenta acessar qualquer rota e é redirecionado, sem conseguir burlar o bloqueio via API.

**Acceptance Scenarios**:

1. **Given** um usuário com status `cancelled`, **When** acessa o app, **Then** é redirecionado para `/assinatura-vencida`.
2. **Given** um usuário com status `inactive`, **When** acessa o app, **Then** é redirecionado para `/assinatura-vencida`.
3. **Given** um usuário com status `past_due`, **When** acessa o app, **Then** é redirecionado para `/assinatura-vencida`.
4. **Given** um usuário com status `active` e `currentPeriodEnd` no passado, **When** acessa o app, **Then** é redirecionado para `/assinatura-vencida`.

---

### User Story 3 — Redirecionamento por Ausência de Plano (Priority: P1 🎯 MVP)

Um usuário recém-cadastrado que ainda não escolheu/assinou nenhum plano (não possui registro na tabela `subscriptions`) é redirecionado para `/assinatura-vencida` ao tentar acessar rotas protegidas da aplicação.

**Decisão**: Redirecionar para `/assinatura-vencida` (mesma página dos vencidos). Contas serão criadas pelo time de backoffice com trial ativo, então o cenário "sem plano" é exceção, não regra. A página pode ter texto genérico ("Acesso não autorizado. Entre em contato com o suporte.") que cobre ambos os casos.

**Why this priority**: Sem esse bloqueio, qualquer usuário pode se cadastrar e usar todas as funcionalidades do FURY indefinidamente sem pagar.

**Independent Test**: Um novo usuário que acabou de se cadastrar tenta acessar o dashboard e é redirecionado, sem conseguir usar nenhuma funcionalidade até assinar um plano (ou receber um trial automático).

**Acceptance Scenarios**:

1. **Given** um usuário recém-cadastrado sem subscription, **When** ele tenta acessar qualquer rota protegida (exceto `/planos`, `/assinatura`, `/assinatura-vencida`), **Then** o sistema redireciona para `/assinatura-vencida`.
2. **Given** um usuário sem subscription, **When** ele acessa `/planos`, **Then** a página de planos é exibida normalmente para que ele possa assinar.

---

### User Story 4 — Acesso a Rotas de Billing e Planos (Priority: P1 🎯 MVP)

Usuários com plano vencido ou sem plano ainda conseguem acessar as páginas de planos (`/planos`), assinatura (`/assinatura`) e a própria página de assinatura vencida (`/assinatura-vencida`). Essas rotas são isentas do bloqueio de subscription para permitir que o usuário regularize seu acesso.

**Why this priority**: Se o usuário é bloqueado também nessas rotas, ele não tem como reassinar — cria um loop sem saída.

**Independent Test**: Um usuário com plano vencido acessa `/planos`, vê a lista de planos e consegue clicar em "Assinar".

**Acceptance Scenarios**:

1. **Given** um usuário com status `past_due`, **When** ele acessa `/planos`, **Then** a página carrega normalmente.
2. **Given** um usuário sem subscription, **When** ele acessa `/assinatura`, **Then** a página informa que não há assinatura ativa e oferece para ver planos.
3. **Given** um usuário com trial expirado, **When** ele acessa `/assinatura-vencida`, **Then** a página exibe as informações de contato e a opção de renovar.

---

### Edge Cases

- Usuário demorou a concluir o cadastro e o trial expirou antes do primeiro login: redirecionado para `/assinatura-vencida` com instruções para renovar.
- Usuário com subscription ativa mas que teve o cartão recusado (status `past_due`): mensagem na página de assinatura vencida orienta a atualizar forma de pagamento, não apenas "contatar suporte".
- `/assinatura-vencida` deve incluir um link/CTA para a página de planos (`/planos`) para que o usuário possa reassinar.
- Rotas de webhook do Asaas (`/billing/webhook`) e health check (`/health`) NÃO devem ter verificação de subscription — são endpoints públicos.
- Dois usuários do mesmo tenant compartilham a subscription: se um deles está em `/assinatura-vencida`, o outro também é bloqueado ao acessar outra rota.

## Current Implementation (Código Existente)

O que já está implementado e testado:

### Schema (packages/db/src/schema.ts)

- **`plans`**: Tabela global com `id`, `name`, `priceCents`, `interval` (monthly/yearly), `features` (jsonb), `isActive`.
- **`subscriptions`**: Tabela por tenant com `planId`, `asaasSubscriptionId`, `asaasCustomerId`, `status` (trial|active|past_due|cancelled|inactive), `trialEndsAt`, `currentPeriodEnd`.
- **`invoices`**: Faturas vinculadas à subscription com valores e status (pending|paid|overdue|cancelled).

### Backend (apps/api/src)

- **`middleware/checkSubscriptionActive.ts`**: Middleware que verifica status da subscription e retorna 403 nos casos: `cancelled`, `inactive`, `past_due`, `trial` expirado, `active` com período vencido. ⚠️ **NÃO está conectado a nenhuma rota** e `if (!sub) return next()` permite usuários sem subscription.
- **`middleware/checkPlanFeature.ts`**: Middleware para verificar features específicas do plano (studio, fury_engine, smart_takedown, etc.).
- **`routes/billing.routes.ts`**: API completa: GET `/plans`, POST `/subscribe` (cria subscription com trial de 7 dias), GET `/subscription`, GET `/invoices`, DELETE `/subscription`, POST `/webhook` (Asaas).
- **`routes/index.ts`**: Middleware `checkSubscriptionActive` importado mas **não aplicado** em nenhuma rota.

### Frontend (apps/web/src)

- **`components/layout/AuthenticatedShell.tsx`**: Hook `useSubscription()` com lógica `isExpired` que verifica status e trial/period expiration. Redireciona para `/assinatura-vencida` quando `isExpired && shouldCheckSubscription`. ⚠️ **`isExpired` retorna `false` quando `subscription === null`** — usuários sem subscription passam sem bloqueio.
- **`pages/billing/AssinaturaVencida.tsx`**: Página estática com ícone de aviso, título "Assinatura Vencida", mensagem de contato e canais de suporte (email). ⚠️ **Não tem CTA para reassinar/ver planos.**
- **`pages/billing/Subscription.tsx`**: Gerencia assinatura ativa (exibe dados, permite cancelar).
- **`pages/billing/Plans.tsx`**: Lista planos disponíveis para assinatura.
- **`hooks/useBilling.ts`**: Hooks `usePlans()`, `useSubscription()`, `useInvoices()`, `useSubscribe()`, `useCancelSubscription()`.
- **`router.tsx`**: Rotas `/planos`, `/assinatura`, `/assinatura-vencida` configuradas.

### Seed (packages/db/src/seed.ts)

- Cria planos no banco via seed (ex: plano mensal/anual com preços e features).

### Testes

- **`apps/api/src/__tests__/billing-subscription.test.ts`**: Testa `checkSubscriptionActive` middleware para cada status (trial válido, trial expirado, cancelled, inactive, past_due, active válido, active expirado, sem subscription).

### Gaps

| Gap | Onde | Descrição |
|-----|------|-----------|
| GAP-1 | `routes/index.ts` | `checkSubscriptionActive` não está aplicado em nenhuma rota |
| GAP-2 | `AuthenticatedShell.tsx` L113-L114 | `isExpired` retorna `false` quando `subscription === null` |
| GAP-3 | `checkSubscriptionActive.ts` L20 | Middleware permite `if (!sub) return next()` sem bloquear |
| GAP-4 | `AssinaturaVencida.tsx` | Página não tem CTA para reassinar/ver planos |
| GAP-5 | `auth.service.ts` register | Registro não cria subscription inicial (trial ou free) |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE redirecionar usuários com subscription expirada (trial vencido, past_due, cancelled, inactive, active com período vencido) para `/assinatura-vencida` no frontend.
- **FR-002**: Sistema DEVE redirecionar usuários sem nenhuma subscription para `/assinatura-vencida` (mesmo destino dos vencidos).
- **FR-003**: Rotas `/planos`, `/assinatura` e `/assinatura-vencida` NÃO DEVEM ser bloqueadas pelo subscription gate.
- **FR-004**: Middleware `checkSubscriptionActive` DEVE ser aplicado a todas as rotas protegidas da API (auth + tenant), exceto `/billing/*`, `/auth/*`, `/health`.
- **FR-005**: Middleware `checkSubscriptionActive` DEVE bloquear (403) usuários sem subscription, além dos casos já implementados.
- **FR-006**: Página `/assinatura-vencida` DEVE incluir um CTA/link para a página de planos (`/planos`) para permitir reassinatura.
- **FR-007**: Webhooks do Asaas (`POST /billing/webhook`) e health check NÃO DEVEM passar por verificação de subscription.
- **FR-008**: Ao renovar a assinatura (pagamento confirmado via webhook), o usuário DEVE ser desbloqueado automaticamente — o frontend deve refletir o novo status sem refresh manual.

### Key Entities

- **Plan**: Plano de assinatura disponível (mensal/anual). Contém nome, preço, intervalo, features habilitadas.
- **Subscription**: Assinatura de um tenant a um plano. Contém status (trial, active, past_due, cancelled, inactive), trialEndsAt, currentPeriodEnd.
- **Invoice**: Fatura gerada por ciclo de cobrança. Contém valor, status (pending, paid, overdue, cancelled), referência ao Asaas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos usuários com subscription expirada são redirecionados para `/assinatura-vencida` em menos de 2 segundos após carregar qualquer rota protegida.
- **SC-002**: 100% das chamadas de API protegidas feitas por usuários sem subscription ativa retornam 403 com código de erro apropriado.
- **SC-003**: Zero rotas de billing expostas a usuários não autenticados ou sem subscription através das rotas isentas.
- **SC-004**: Usuários com subscription renovada (webhook confirma pagamento) recuperam acesso em menos de 1 minuto sem refresh manual.
- **SC-005**: Zero usuários reportam bloqueio em rotas isentas (`/planos`, `/assinatura`, `/assinatura-vencida`).
- **SC-006**: Página `/assinatura-vencida` tem taxa de clique no CTA "Ver planos" > 40% (métrica de negócio para acompanhar pós-deploy).

## Assumptions

- O fluxo de registro de usuário (criação de tenant + usuário) não será alterado — a subscription é criada apenas quando o usuário assina um plano ou quando o backoffice cria a conta com trial.
- Contas são criadas pelo time de backoffice com trial ativo, então o cenário "sem subscription" é exceção para falha de criação.
- Rotas públicas (`/health`, `/auth/*`) não precisam de verificação de subscription.
- Webhooks Asaas são validados por token de acesso, não por subscription.
- O `checkSubscriptionActive` middleware já está testado — a implementação dos gaps consiste principalmente em conectar o middleware às rotas e ajustar a lógica de `null`.
- Usuários demo (se existirem) podem ser isentos do subscription gate (a ser definido).

## Clarifications

### Session 2026-07-20

- Q: Para onde redirecionar usuário sem subscription? → A: `/assinatura-vencida` (mesmo destino dos vencidos). Contas criadas pelo backoffice com trial, então "sem plano" é exceção.
