# [N3] Investigar falhas 503 nas sugestões de texto e legenda

## Evidências e limites
No período 10–17/11/2026 UTC foram observados três eventos web 503: legenda em 12/11 01:30:43Z e 14:46:48Z; texto em 16/11 23:39:34Z. Backend: três CAPTION_SUGGESTION_UNAVAILABLE e um AD_COPY_SUGGESTION_UNAVAILABLE. Não somar fontes: podem representar as mesmas requisições. Sem acesso a logs/traces históricos nesta sessão, não há correlação individual nem causa confirmada. OpenRouter é o gateway identificado no código, não necessariamente o provedor upstream responsável.

## Specs e aceitação
1. Preservar contratos de autenticação, tenant, mídia e persistência; nenhum novo banco, job ou publicação. ADR-0001 aplicável; ADR-0002 ausente na base examinada.
2. Compartilhar execução de sugestões: até dois modelos, uma chamada por modelo; timeout real de 20s por chamada. Erros transitórios (429, 5xx, rede, timeout) permitem segundo modelo após 250ms. Erros permanentes interrompem. Resposta inválida permite fallback de modelo, sem repetir o mesmo modelo nem acrescentar conteúdo inválido ao prompt. Sem retry automático no browser.
3. Registrar evento sanitizado por tentativa: gateway, modelo, endpoint, requestId, ambiente, duração, resultado, status upstream quando disponível. Não registrar prompt, resposta, mídia ou erro bruto. Erro final mantém mensagem segura. Exceções backend incluem ambiente e requestId. Browser registra requestId da resposta para correlação.
4. Falha ou resposta inválida não modifica campos. Campanhas ignora resultado se texto ou seleção mudou durante geração; trava reentrada síncrona. Planner mantém proteção de geração existente. Edição e continuidade manual permanecem disponíveis após falha.
5. TDD pt-BR: sucesso, timeout, 503, inválido, permanente, limite/backoff e ausência de vazamento; regressões dos dois fluxos e telemetria. Rodar testes focados, builds e CI. Abrir PR para hmg, atualizar base e verificar conflitos/checks sem merge.

## Passos
- [x] Verificar PRs abertas (nenhuma relacionada encontrada), isolar checkout de origin/hmg, ler implementação e testes.
- [x] Escrever regressões e confirmar RED (executor ausente; UI sobrescrevia edição/aceitava campos inválidos; adaptador aceitava envelope inválido).
- [x] Implementar executor limitado, diagnósticos e proteção de UI; confirmar GREEN.
- [ ] Revisar diff, validar builds, abrir PR e acompanhar CI/base.

## Investigação futura de produção
Buscar cada timestamp acima em request_logs e PostHog, pelo x-request-id e ambiente quando disponíveis; associar uma requisição web ao evento backend, sem deduplicação por contagem presumida. Novos eventos suggestion_attempt permitem separar timeout, status upstream e contrato inválido; eventos legados sem esses dados permanecem inconclusivos.

## Validação local
- API: 8 arquivos focados, 79 testes passaram (antes das duas regressões adicionais do envelope; reexecutar adaptador).
- Web: 3 arquivos focados, 25 testes passaram.
- Builds shared/db/api/web passaram.
- Playwright `playwright.caption.config.ts`: 2 testes passaram (light/dark), checkout isolado servido na porta 5198; APIs externas simuladas, sem geração/publicação real.
- A suíte legada request-logger.test.ts falhou localmente por ausência dos serviços de integração (Redis/Postgres); não foi alterada nem enfraquecida. A correlação do middleware tem teste isolado próprio. O CI provisiona serviços para suas suítes.
- Graph MCP indisponível nesta sessão; escopo e revisão conferidos diretamente no código.

## Operação
Configurar APP_ENV=hmg ou APP_ENV=prod nos respectivos ambientes antes do próximo deploy. Fallback: DEPLOYMENT_ENV, NODE_ENV, unknown. NODE_ENV=production não permite distinguir HMG de prod sozinho. Sem alteração de configuração remota ou deploy nesta tarefa.
