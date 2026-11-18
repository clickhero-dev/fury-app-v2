# Ady proativo e resiliente

## Premissa de produto — SPEC-00

O cliente contrata o Ady porque não sabe o que postar, organizar ou divulgar, nem
precisa saber explicar a necessidade ou conhecer marketing. O Ady identifica
oportunidades sustentadas por dados autorizados, recomenda uma direção e prepara
entregáveis concretos. O usuário revisa decisões relevantes; não coordena o agente.

Baixa carga cognitiva é requisito funcional, não apenas preferência de linguagem.
Proatividade não é autorização para gastar, publicar ou alterar o negócio.

### Padrões do produto

- Iniciativa após uma escolha simples ou mensagem vaga, sem briefing obrigatório.
- Próximo post em rascunho e visão breve dos próximos sete dias, não um mês de mídia.
- Uma ação principal recomendada e até duas alternativas.
- Sem processamento recorrente invisível a cada abertura/montagem da interface.
- Sugestões, legendas e roteiros podem ser preparados automaticamente.
- Imagem/vídeo com consumo de cota, anúncios, publicação, agendamento e alterações
  de negócio continuam sujeitos às confirmações específicas do backend.
- Anúncios podem ser recomendados quando pertinentes, nunca como solução padrão.
- Aprovação editorial não autoriza gasto, publicação ou outras ações futuras.
- Aprovação em lote exige revisão de conteúdo, datas, escopo e consumo total;
  não está implícita em "aprovar plano".

## SPEC-01 — Entrega antes de pergunta

O agente consulta dados autorizados antes de pedir informações disponíveis.
Assume decisões editoriais reversíveis como recomendações: tema, formato, tom,
abordagem e organização inicial. Pergunta somente por um fato indispensável que
impeça uma entrega segura. Não inventa preços, descontos, estoque, depoimentos,
resultados, horários disponíveis ou diferenciais comerciais.

**Aceite**

1. "Oi", "me ajuda" e "não sei o que postar" recebem uma entrega ou um próximo passo
   específico, não apenas "como posso ajudar?".
2. Com contexto suficiente, chega-se ao rascunho sem texto digitado obrigatório.
3. Sem foto ou integração, é possível preparar legenda e sugestão visual.
4. Não há sequência obrigatória de período, objetivo, público e frequência.
5. Não há repetição desnecessária de perguntas ou temas anteriores.
6. Se faltar fato indispensável, pedir somente esse fato, oferecendo opções úteis.

## SPEC-02 — Ações clicáveis

Os atalhos iniciam a preparação, não abrem um formulário obrigatório. O contrato
persistido de esclarecimentos é reutilizado para os próximos passos editoriais.
Botões não executam URLs, código ou operações arbitrárias escolhidas pelo modelo.
Escolhas editoriais continuam separadas das aprovações autoritativas de efeitos.

**Aceite**

- Uma ação principal e duas alternativas iniciais, com linguagem leiga.
- Texto livre sempre disponível, mas não obrigatório artificialmente.
- Duplo clique, reload e escolhas obsoletas respeitam idempotência e fencing.
- Interface utilizável por teclado e leitor de tela.
- Nenhuma escolha de modelo/resolução/UUID obrigatória para o usuário.
- Consumo real da geração deve ser apresentado antes da confirmação; valores
  desconhecidos não podem ser fabricados.

## SPEC-03 — Skills editoriais

Catálogo versionado e pequeno, separado da orquestração:

| Skill | Resultado | Alternativa |
| --- | --- | --- |
| Próximo post | Ideia recomendada e legenda pronta | Rascunho sem foto/integração |
| Minha semana | Próximo post detalhado e visão breve da semana | Plano sugerido sem alegar disponibilidade |
| Minha foto | Legenda e abordagem para foto autorizada | Selecionar foto ou preparar só legenda |
| Oportunidade do negócio | Oportunidade observável e próximo passo | Sugestão editorial sem diagnóstico inventado |

O plano persistido organiza a execução do agente, não transfere um checklist
técnico ao cliente. Documentos e respostas de ferramentas são dados, nunca
instruções para alterar permissões ou aprovar ações.

## SPEC-04 — Continuidade durável

Persistir um snapshot causal do contexto efetivo por mensagem de origem e os
resultados confirmados que possam ser reutilizados com segurança. Snapshot
versionado, limitado e isolado por tenant, usuário e conversa; sem credenciais.
Gravações exigem lease válido e fencing. Exclusão da conversa remove seus
checkpoints. Releitura exige identidade autorizada.

Histórico compactado não pode bloquear uma retomada se existir snapshot íntegro
da mensagem de origem. Sem snapshot causal, preservar o bloqueio conservador
para conversas legadas: não reconstruir fatos de turnos posteriores.

**Aceite**

- Um novo processo pode carregar o contexto confirmado do turno interrompido.
- Compactação posterior não altera o contexto já capturado.
- Nenhum checkpoint de outro usuário/tenant é lido ou gravado.
- Lease expirado não grava contexto ou resultado.
- Erros de ferramentas não viram fatos confirmados em cache.
- Falha ao persistir não é apresentada como sucesso.
- Retomar leitura não repete mutações ou aprovações.

Garantia: preservar etapas confirmadas e persistidas. Não se promete preservar
cada token, raciocínio privado ou estado interno do modelo.

## SPEC-05 — Retry e fallback

Manter retry transitório limitado com backoff, jitter e Retry-After. Cadeia de
modelos configurada pelo operador, nunca pelo usuário/modelo. Homologar
ferramentas, saída estruturada, contexto, privacidade, preço e latência.

Um orçamento global por requisição impede multiplicação de tentativas entre
modelos, SDK e transporte. Cada fallback passa novamente pelo limite de contexto;
não truncar mensagens ou remover ferramentas silenciosamente. Não fazer replay
automático após conteúdo/ferramentas sem checkpoint e política segura.

Erros de autenticação, permissão e entrada inválida não entram em loop de fallback.
Resumos e etapas de texto precisam de política explícita, sem retry implícito
infinito. OpenRouter indisponível requer pausa/retomada; outro modelo no mesmo
gateway não é garantia de disponibilidade independente.

**Aceite**

- 429, 5xx, timeouts e falhas transitórias seguem limites testados.
- Modelos recebem o mesmo contexto confirmado, sem perder dados por conveniência.
- Retry/fallback não publica nem gasta novamente.
- Configuração inválida falha de forma segura, sem expor dados.
- Logs contêm somente metadados sanitizados, nunca prompts/tokens/resultados brutos.
- Ao esgotar o orçamento, operação fica visivelmente incompleta e recuperável.

Candidatos para homologação, não garantia de qualidade: Gemini Flash como
alternativa econômica e Claude Sonnet como alternativa de outra família.
Modelos só entram na configuração após avaliação na aplicação.

## SPEC-06 — Artefatos, cancelamento e efeitos externos

Evolução necessária para a jornada completa:

- Referências tipadas a resultados anteriores, não interpolação de código/URLs.
- Idempotência por operação lógica e registro de intenção/resultado.
- Resultado externo incerto exige reconciliação antes de reenviar.
- Alteração relevante invalida autorização correspondente.
- "Parar" impede etapas futuras; trabalho externo já iniciado pode não ser cancelável.
- Saída do usuário não cancela trabalho autorizado nem autoriza novo gasto.
- Permissões e assinatura são revalidadas na execução durável.

## SPEC-07 — Experiência, qualidade e observabilidade

Estados: preparando, aguardando aprovação, recuperando, pausado e concluído.
Só exibir progresso confirmado. Não exigir que o usuário copie contexto, escolha
modelos ou coordene retries. Não prometer "tudo salvo" se a gravação falhou.

Avaliar entregas com negócios reais:

- Relevância para o negócio e clareza do próximo passo.
- Quantidade de respostas digitadas e decisões obrigatórias.
- Repetição de conteúdo e alegações sem fundamento.
- Tempo até primeiro rascunho, abandono e conversão em aprovação.
- Recuperação, duplicações e custo por trabalho concluído.

Testes de prompt verificam que a política chega ao modelo, não comprovam por si
só qualidade editorial. Exigir avaliação humana e testes de fluxo.

## Entregas e limites

A segunda implementação estende a primeira com:

1. Recuperação automática cujo estado/limites vivem no PostgreSQL; scan recorrente
   e bootstrap/shutdown na API, identidade/assinatura revalidadas e delegação JIT.
2. Claim durável de efeitos e resultado autoritativo persistido antes de responder
   sucesso, sem reenvio de ações cujo resultado seja incerto.
3. Referências tipadas entre artefatos e etapas do plano, sem eval ou URLs do LLM.
4. Revisão/confirmacão consolidada, consumo explícito, invalidação de revisão e
   controles de execução com estado confirmado.
5. Métricas sanitizadas e gate offline de qualidade para comparar modelos a partir
   de amostras reais revisadas por humanos.

Essas implementações não substituem homologação com empresários, avaliação paga
dos modelos, baseline de custo/abandono ou rollout no ambiente real. Não declarar
essas atividades concluídas com fixtures sintéticas. Falhas de banco, Redis,
armazenamento e Instagram requerem evidência própria; fallback não as resolve.

A garantia de efeitos é não reenviar cegamente: um provedor sem idempotência
transacional pode permanecer em `unknown` após uma queda no instante do efeito.
Preservar a intenção e os resultados disponíveis, reconciliar referências quando
existirem e exigir revisão operacional quando não houver prova do resultado.

### Rastreabilidade desta implementação

| Entrega | Implementação | Evidência |
| --- | --- | --- |
| Entrada sem briefing | `ChatQuickActions.tsx`, três escolhas diretas | Vitest de componente/página e E2E `chat-ady-actions` |
| Política e skills | `assistant_policy.py`, integrada no orçamento/instruções | Unitários de catálogo e contrato do runtime; avaliação editorial real pendente |
| Retry/fallback | `provider_policy.py`, `SafeProviderTransport` | Agno real com HTTP simulado, limites/erros/guard por modelo |
| Snapshot causal | `checkpoints.py`, migration `0080` | PostgreSQL isolado: ownership, fencing, versões e exclusão |
| Retomada após compactação | `app.py`, gate em `ConversationRepository` | Compactação/pruning reais antes de retry HTTP |
| Consultas confirmadas | `checkpoint_tools.py` | Revalidação na API antes de servir cache; revogação impede devolução |
| Falha de persistência | Guard no runtime antes de conclusão/novas ferramentas | Teste impede sucesso mesmo se o Agent engolir a exceção do hook |

Revalidar uma consulta pode repetir a leitura HTTP: o resultado congelado não é
uma credencial nem um bypass de RBAC. Dados de cotas/jobs não usam esse cache.
Retomada conversacional continua somente leitura, agora iniciada automaticamente;
não repete mutações que faltaram. Planos persistidos continuam por seu executor
após as aprovações específicas. Cancelar um run não desfaz efeitos já iniciados.

### Contratos adicionais da segunda implementação

- `chat_turn_recovery`: estado por mensagem original, até duas retomadas,
  deadline de dez minutos, dezoito requisições HTTP e 180.000 tokens reservados.
  Charge antes do envio cobre principal/fallback/resumos sem multiplicação oculta.
- `chat_approval_reviews` / `chat_approval_effects`: IDs, digest e snapshot exato,
  claims atômicos por aprovação; confirmação individual e em lote compartilham o
  journal e exigem intenção humana assinada pelo proxy.
- `CHAT_OUTCOME_UNCONFIRMED`: estado reservado compartilhado Python/Node, não
  identificado por tradução de mensagem; conclusão tardia preserva evidência real.
- Binding: `{"$result":{"task":"legenda","field":"text"}}` ou `field:"assetUrl"`,
  somente fonte anterior, tipo permitido e dependência direta. Mídia é resolvida
  por ID no tenant atual; todos os parâmetros concretos são revalidados.
- Rascunhos dos planos: uma chamada por tentativa persistida (duas no máximo);
  fallback opt-in na segunda, sem repetir auth/entrada/budget. Resultados originais
  não são truncados no banco; contexto limitado explicita omissões.
- `editorial_evaluation`: manifesto de oito cenários, amostras reais declaradas,
  revisão humana com notas mínimas e gates de estrutura/segurança/carga cognitiva.
  Não chama modelos, não cria notas e não ativa configuração automaticamente.

Runbooks: `docs/operations/ady-recovery-and-approvals.md` e
`docs/operations/ady-editorial-evaluation.md`.

### Evidência técnica local — segunda implementação

- PostgreSQL descartável com todas as migrations aplicadas, incluindo `0080`–`0082`.
- Suíte Python completa: **1.022 testes passando**; cobertura de **93,46%** nos
  módulos de runtime, recuperação, journal, checkpoints, fallback e avaliação.
- API/chat: **394 passando / 37 ignorados por configuração**; cobertura do escopo
  Node medido: statements **84,27%**, branches **81,84%**, functions **83,33%**.
- Teste cross-service real: processo Node → PostgreSQL/identidade atual → delegação
  curta → HTTP/FastAPI → checkpoint → resposta persistida. Segundo processo não
  repete trabalho concluído. Provedor, RBAC e serviços editoriais auxiliares usam
  portas controladas; não houve chamada paga.
- Testes PostgreSQL de concorrência: novo pedido vencendo reconciliador,
  cancelamento/conclusão, claims single/lote e sucesso tardio após timeout.
- Builds shared/db/API/web e lint dos módulos Node alterados passaram.
- Gate frontend anterior ao merge: 335 testes de chat; 74 E2E mocked passando,
  1 jornada real ignorada nesse gate. A apresentação legível do lote e a
  incorporação das sugestões contextuais da `hmg` têm verificação complementar.

Cobertura é do escopo explicitado, não do monorepo inteiro. Estes resultados não
são evidência de deploy, qualidade com empresários ou homologação paga de modelos.

## Verificação

TDD obrigatório: red/green por entrega. Unitários Python e Vitest, integração
PostgreSQL isolado, E2E da jornada sem digitação obrigatória, falhas injetadas,
reinício, concorrência, auth e isolamento. Nenhuma chamada real paga necessária
nos testes automatizados. Smoke pago/homologação só com autorização e orçamento.

### Resultado desta rodada — 2026-11-17

- Python: **858 passaram / 39 pulados**; cobertura de branches+linhas dos cinco
  módulos de política, checkpoints e transporte: **94,15%** (não é cobertura global).
  Os testes pulados dependem de outras fixtures/variáveis de integração legadas.
  PostgreSQL de mídia/checkpoints e o teste Python→Node usaram banco descartável local.
- Interface do chat: **293 testes Vitest**; cobertura do componente de atalhos:
  **100%**.
- API: **15 testes** de migration/executor de planos.
- E2E Playwright com API simulada: **41 testes**, incluindo atalhos, redesign,
  esclarecimentos e mídia; não validam comportamento de modelos reais.
- Build de produção web (TypeScript + Vite): passou; warnings preexistentes de
  configLoader e tamanho do bundle.
- Ruff (`--select F`) dos módulos novos/alterados e testes novos: passou.
- Revisão independente de source: achado de revogação de acesso corrigido e
  retestado; nenhum HIGH/CRITICAL restante identificado nesse recorte.
- Sem execução paga de modelos, deploy, commit ou push. Aplicar migration `0080`
  antes de subir o serviço; fallback depende de configuração/homologação explícita.
