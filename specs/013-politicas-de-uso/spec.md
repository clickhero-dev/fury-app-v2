# Feature Specification: Versionamento e Aceite de Política de Uso

**Feature Branch**: `feat/politicas-de-uso`

**Created**: 2026-09-10

**Status**: Draft

**Input**: Versionamento da política de uso do Ady com aceite obrigatório por usuário, novos aceites a cada atualização, redirecionamento quando pendente, persistência em banco e verificação no login sem over-fetching.

## Decisões Confirmadas (perguntas com opções)

1. **Gate do fluxo**: no login — usuário novo é direcionado à política antes do onboarding; usuário antigo antes do dashboard.
2. **Granularidade**: por usuário (cada pessoa da conta aceita individualmente).
3. **Interação**: checkbox "Li e concordo" + botão "Aceitar".
4. **Disparo de novo aceite**: sempre que a versão da política mudar (campo `version` + vigência).
5. **Persistência**: duas tabelas — `policy_versions` (histórico de versões + texto; a vigente é a de inserção mais recente) e `policy_acceptances` (quem aceitou, quando, qual versão).

## User Scenarios & Testing

### User Story 1 — Usuário antigo reaceita a política após atualização (P1)

Um usuário já cadastrado faz login após uma atualização da política de uso. Antes de acessar o dashboard, ele é redirecionado para a página de aceite exibindo a nova versão, marca "Li e concordo" e clica em "Aceitar". O aceite fica gravado e ele segue para o dashboard.

**Why this priority**: é o requisito central — garante conformidade legal (aceite da versão vigente) sem bloquear o uso legítimo.

**Independent Test**: login de usuário com versão não aceita → redireciona para `/politica`; aceite → segue para o dashboard; recarregar a página não re-exige o aceite.

**Acceptance Scenarios**:
1. **Given** usuário logado sem aceite da versão vigente, **When** acessa qualquer rota autenticada, **Then** é redirecionado para a tela de aceite.
2. **Given** usuário na tela de aceite, **When** clica "Aceitar" sem marcar o checkbox, **Then** o botão permanece desabilitado.
3. **Given** usuário marca "Li e concordo" e clica "Aceitar", **When** a API registra o aceite, **Then** o usuário é redirecionado ao dashboard e não é mais bloqueado.

### User Story 2 — Usuário novo aceita antes do onboarding (P1)

Ao criar a conta, o usuário é levado à política de uso antes de iniciar o onboarding de integração (Meta).

**Why this priority**: recém-cadastrados não têm aceite registrado; exigem o mesmo gate, mas com destino pós-aceite distinto (onboarding em vez de dashboard).

**Independent Test**: registro de novo usuário → após login/registro cai na tela de aceite → aceite → segue para `/onboarding/conectar-meta`.

**Acceptance Scenarios**:
1. **Given** usuário recém-registrado sem fluxo de onboarding concluído, **When** faz aceite, **Then** é direcionado ao onboarding (não ao dashboard).

### User Story 3 — Verificação no login sem over-fetching (P2)

O estado de aceite (versão vigente + se já aceita) retorna **embutido na resposta de login**, evitando uma chamada extra de rede/banco ao iniciar. O frontend persiste esse estado para não refazer a checagem a cada reload.

**Why this priority**: critério de aceite "performance / evitar over fetching" — a checagem não pode custar uma requisição adicional por boot.

**Independent Test**: login retorna `policy { currentVersion, accepted }`; o `AuthenticatedShell` decide o gate sem nova chamada; reload usa o valor persistido.

**Acceptance Scenarios**:
1. **Given** usuário faz login, **When** a resposta chega, **Then** contém o estado de aceite já calculado (1 query agregada no backend, sem round-trip extra).
2. **Given** estado de aceite persistido como "aceito", **When** o app recarrega, **Then** não dispara chamada redundante à política.

### Edge Cases

- **Versão atual não encontrada** (tabela `policy_versions` vazia): não bloquear o usuário (fail-open) — tratar como "sem política vigente".
- **Usuário aceita a versão A enquanto a versão B é publicada em seguida**: o aceite registra a `policyVersionId`, nunca uma string solta; a checagem compara com a versão vigente do momento.
- **Aceite duplicado**: `unique (user_id, policy_version_id)` impede duplicidade; requisição repetida é idempotente.
- **Superadmin/rota admin**: isenção — o gate não se aplica à área `/admin`.
- **Token expirado no meio da tela de aceite**: a chamada `POST /policy/accept` retorna 401 e o usuário volta ao login.
- **Usuário faz logout sem aceitar**: aceite não fica pendente de forma a quebrar o próximo login.
- **Rota pública** (`/l/:codigo`, `/roadmap`, login, cadastro): não exigem aceite.

## Requirements

### Functional Requirements

- **FR-001**: O sistema DEVE manter versões da política (`policy_versions`) com campo `version`, `content` (texto), `effective_from` e `created_at`; a versão vigente é a de `created_at` mais recente (ou `effective_from` mais recente).
- **FR-002**: O sistema DEVE registrar cada aceite (`policy_acceptances`) com `tenant_id`, `user_id`, `policy_version_id` e `accepted_at`.
- **FR-003**: O aceite DEVE ser por usuário (não por tenant).
- **FR-004**: A resposta de login (e refresh via `/auth/me`) DEVE incluir o estado de aceite da versão vigente (`currentVersion` + `accepted`).
- **FR-005**: O frontend DEVE redirecionar usuários autenticados sem aceite para a página de aceite (`/politica`), exceto rotas isentas (onboarding de aceite, `/admin`, públicas).
- **FR-006**: A página de aceite DEVE exibir o conteúdo da versão vigente e exigir o checkbox "Li e concordo" antes do botão "Aceitar" habilitar.
- **FR-007**: O sistema DEVE expor `GET /policy/current` (conteúdo + versão) e `POST /policy/accept` (registra aceite).
- **FR-008**: As tabelas de aceite DEVE ser tenant-scoped com Row-Level Security, conforme Constitution (Princípio I).
- **FR-009**: A checagem de aceite no login DEVE ser feita em uma única consulta agregada (sem N+1, sem chamada extra do frontend).

### Key Entities

- **policy_versions** (global, não-tenant): `id` (uuid PK), `version` (varchar), `content` (text), `effective_from` (timestamptz), `created_at` (timestamptz).
- **policy_acceptances** (tenant-scoped): `id` (uuid PK), `tenant_id` (uuid FK), `user_id` (uuid FK), `policy_version_id` (uuid FK), `accepted_at` (timestamptz), `unique (user_id, policy_version_id)`.

## Success Criteria

- **SC-001**: Login adiciona ≤ 1 query agregada e ZERO round-trips extras do frontend para determinar o gate de aceite.
- **SC-002**: Usuário pendente é impedido de acessar o dashboard até aceitar; aceite fica persistido e sobrevive a reload.
- **SC-003**: Atualização da política (nova versão) exige novo aceite de todos os usuários.
- **SC-004**: Testes unitários cobrem: gate (aceito/pendente), aceite de versão específica, idempotência/duplicidade e fail-open quando não há versão vigente.

## Assumptions

- A política é a mesma para todos os tenants (termo de uso global), portanto `policy_versions` é global e `policy_acceptances` é tenant-scoped.
- O texto inicial da política será semeado na migração a partir de `docs/politicas-de-uso-ady.txt` (versão 1.0).
- O padrão existente de guard (`AuthenticatedShell` + `subscriptionGuard`) será reutilizado para o gate de política, sem introduzir novo mecanismo de roteamento.
- A persistência segue ADR-0001: repository tenant-bound, service/controller como classe DI no `di.ts`.
- Fail-open (não bloquear) quando não há versão vigente, para não derrubar o acesso em cenário de dados ausentes.
