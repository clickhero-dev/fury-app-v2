# Benchmark de voz e sincronização labial em pt-BR

**Status:** documental — nenhuma medição real executada
**Data da consulta:** 2026-11-03
**Decisão nesta fase:** **inconclusivo**; não autoriza protótipo ou produção.

## Objetivo e fronteiras

Este estudo define um benchmark reproduzível para comparar o vídeo generativo atual
do Ady com um fluxo especializado de avatar, voz e lip-sync. A referência de
avatar/lip-sync é HeyGen; OpenRouter é o baseline de vídeo generativo; ElevenLabs
Instant Voice Cloning (IVC) é avaliado somente como opção de voz independente.

Não foram criadas credenciais, feitas chamadas de API, enviados áudios/imagens,
criados clones, gravados dados de cliente nem realizados gastos. Esta fase também
não altera API, banco, quotas, worker, armazenamento, contratos ou UI do Fury.
Uma eventual integração exige uma spec própria e não é consequência automática
deste relatório.

## Evidência do baseline Fury

O ticket descreve um fluxo OpenRouter com job assíncrono, polling, retomada e
persistência. A verificação no checkout isolado desta PR encontrou uma divergência
de base: a branch solicitada, `dev` (HEAD `110ead32` em 2026-11-03), **não contém**
os paths abaixo; tampouco eles existem no commit atual de `hmg` consultado em modo
somente leitura:

- `apps/api/src/services/studio/studio-video.service.ts`
- `apps/api/src/lib/openrouter-video.ts`
- `apps/api/src/workers/studio-video.worker.ts`
- `apps/api/src/routes/studio-video.routes.ts`
- `apps/api/src/__tests__/studio-video.service.test.ts`

Havia, no checkout de origem fornecido para a triagem, versões não confirmadas em
Git desses arquivos. Essa cópia de trabalho implementa `POST /studio/video/jobs`,
vídeos de 15 s em `9:16` ou `16:9`, `generate_audio: true`, polling e retomada por
ID de job, limite de dois jobs ativos por tenant, quota mensal e gravação em R2 ou
storage local. O worker usa BullMQ, `attempts: 1` por risco de nova cobrança, e
mantém o ID externo para não reenviar uma submissão já aceita. Esses fatos são
**evidência de um snapshot local não versionado**, não garantia do conteúdo de
`dev` nem escopo desta PR.

O adaptador desse snapshot usa `fetch` direto para OpenRouter, enquanto a política
de integrações exigiria, em uma futura feature, timeout pelo wrapper
`lib/http-client.ts`, sanitização de erro, telemetria e testes de integração
bloqueantes. Nenhum código foi alterado aqui para não transformar um estudo em
mudança de produto.

### ADRs aplicáveis

- ADR-0001 está presente e accepted em `dev`: uma implementação futura deve manter
  repositórios tenant-bound e injeção de dependência nas camadas superiores.
- ADR-0002 não está no índice nem na árvore da base consultada; não foi inferido.
- ADR-0004 não está na base `dev` desta PR. O handoff a cita como accepted em outra
  base; antes de uma feature, validar a ADR válida no checkout-alvo e preservar a
  política de jobs, idempotência e recuperação aplicável.

## Capacidades documentadas (não medidas)

| Provedor / papel | Evidência oficial consultada | O que a fonte sustenta | Lacuna relevante para a decisão |
| --- | --- | --- | --- |
| OpenRouter / baseline de vídeo | [Create videos](https://openrouter.ai/docs/api/api-reference/video-generation/create-videos) | `POST /api/v1/videos` é assíncrono, devolve ID/polling URL e aceita duração, proporção, `generate_audio` e referências conforme o modelo. Documenta 400, 401, 402, 404, 429 e 500. | A API normalizada não prova identidade, voz clonada ou precisão de boca; suporte efetivo depende do modelo. |
| HeyGen / avatar e lip-sync | [API pricing](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-credits-explained) e [Speech-to-Speech](https://help.heygen.com/en/articles/17756130-how-to-use-speech-to-speech-voice-mirroring-in-heygen) | A tabela lista Lipsync Audio e o guia mostra Speech-to-Speech separado para uma Instant Voice ativa, seguido do vídeo de avatar com `audio_url`. | Mínimo de 10 s, retenção, região, formatos, limites e concorrência devem ser confirmados no plano/endpoint da conta de teste. |
| ElevenLabs / voz independente | [IVC](https://elevenlabs.io/docs/pt/eleven-creative/voices/voice-cloning/instant-voice-cloning), [criar clone](https://elevenlabs.io/docs/pt/api-reference/voices/ivc/create) e [modelos](https://elevenlabs.io/docs/pt/overview/models) | IVC pede no app pelo menos 5 s por arquivo e 10 s agregados; recomenda 1–2 min de áudio limpo. A API cria voz via multipart. Modelos multilíngues declaram suporte a português, incluindo Brasil/Portugal. | Não cria vídeo nem lip-sync; qualidade, custo, limites, retenção e disponibilidade por plano precisam de medição/contrato. |

### Custos públicos, apenas para planejamento

Valores são referências públicas consultadas em 2026-11-03, em USD, e não são
fatura, orçamento nem garantia de preço. A página de preços HeyGen lista Lipsync
Audio em **US$ 0,84/min (Speed)** e **US$ 1,74/min (Precision)**; o guia de
Speech-to-Speech informa **US$ 0,12/min**. Para um vídeo de 15 s, a estimativa
linear meramente ilustrativa é `0,25 × tarifa/min`: US$ 0,21 / US$ 0,435 para
lip-sync ou US$ 0,03 para speech-to-speech, antes de avatar, voz, armazenamento,
taxas, mínimos de cobrança e impostos. Confirmar modelo, crédito e arredondamento
na conta antes de usar qualquer valor como teto.

OpenRouter expõe `usage.cost` quando a geração concluir, mas o custo depende do
modelo. ElevenLabs deve ter preço e consumo verificados no plano aplicável; este
relatório não estima valor sem fonte de preço e fatura correspondente.

## Pré-requisitos bloqueantes

Todos os itens abaixo precisam existir antes de uma execução real. Se algum faltar,
não enviar mídia, não chamar endpoint pago e manter decisão `inconclusivo`.

1. Credenciais válidas em contas de teste, sem segredos no repositório, ClickUp ou logs.
2. Consentimento verificável do titular para clonagem, criação de avatar, envio ao
   fornecedor, avaliação e exclusão; ou rosto e voz sintéticos/licenciados com os
   mesmos direitos.
3. Autorização explícita de gasto, teto em USD, plano/modelo definidos e regra de
   parada ao alcançar o teto.
4. Aprovação de retenção, DPA, região, suboperadores e exclusão do fornecedor.
5. Meio aprovado para mídia: URLs temporárias restritas. Se o provedor exigir URL
   pública sem alternativa segura aprovada, o caso não é executado.
6. Dois avaliadores independentes e disponibilidade de ambiente isolado.

## Corpus controlado

Usar uma única pessoa/voz autorizada por rodada, uma tomada frontal limpa e o
mesmo avatar/rosto permitido onde o fornecedor suportar. Gerar pares `9:16`;
qualquer resultado em formato diferente é registrado como não comparável, não
reconvertido silenciosamente.

| Caso | Duração-alvo | Roteiro fixo em pt-BR | Estímulo técnico |
| --- | ---: | --- | --- |
| C1 — neutro | 10–15 s | “Olá, eu sou a voz deste teste. Hoje vamos mostrar uma ideia simples, clara e útil para você.” | Fala frontal, cadência natural. |
| C2 — fonemas | 10–15 s | “Bruno põe pouca pimenta no pão; Bia bebe água, sorri e explica os próximos passos.” | Bilabiais `/p/`, `/b/`, `/m/` e sibilantes. |
| C3 — ritmo e oclusão | 10–15 s | “Quando o prazo aperta, eu preciso falar rápido, pausar um segundo e concluir com clareza agora.” | Fala mais rápida e breve oclusão/movimento autorizado. |

A referência para clonagem é aproximadamente 10 s, limpa, com um locutor e sem
música. Se o fornecedor a rejeitar por mínimo maior, registrar
`incompatível_com_10_s`. É permitido testar o mínimo aceito em uma coluna
separada, mas nunca classificá-lo como sucesso do requisito de 10 s.

## Desenho de experimento

1. Registrar no diário: data/hora, fornecedor, plano, modelo, endpoint, região
   declarada, limite de concorrência, hash/ID anônimo da entrada, orientação,
   duração pedida e autorização de gasto.
2. Executar OpenRouter e HeyGen para cada caso suportado, com o mesmo roteiro,
   orientação e duração-alvo. Tratar diferenças de capacidade como
   `não comparável`, não como nota zero.
3. Quando a voz precisar ser reutilizada fora do avatar, executar em trilha
   separada HeyGen Instant Voice versus ElevenLabs IVC. Não usar a trilha de voz
   isolada para alegar qualidade de vídeo/lip-sync.
4. Com os pré-requisitos atendidos, realizar três repetições por caso/provedor,
   alternando a ordem. Rodar concorrência 1, 2 e 4 somente se teto e limite do
   fornecedor permitirem; 4 fica fora do fluxo Fury, cujo snapshot local limita 2
   jobs ativos por tenant.
5. Não reenviar automaticamente uma submissão que expirou após o envio e não
   devolveu ID. Primeiro reconciliar por ID/idempotency key/documentação/fatura;
   sem prova, classificar como `submissão_incerta`.
6. Ao encerrar, excluir mídia, clones e URLs temporárias conforme a política
   aprovada, registrar comprovação de exclusão e revogar acessos.

## Matriz de coleta

Preencher uma linha por saída (inclusive erro), sem nomes de pessoas, tokens ou
URLs reutilizáveis.

| fornecedor | modelo/plano | caso | repetição | conc. | entrada 10 s aceita? | aceite (s) | pronto (s) | estado/erro | custo USD | duração/codec | intervenção | link/ID anônimo |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | --- | --- | --- |
| OpenRouter | não medido | C1 | — | — | n/a | — | — | não medido | desconhecido | — | — | — |
| HeyGen | não medido | C1 | — | — | não verificado | — | — | não medido | estimativa separada | — | — | — |
| ElevenLabs (voz) | não medido | C1 | — | — | não verificado | — | — | não medido | desconhecido | áudio | — | — |

- `aceite (s) = t_resposta_de_aceite − t_submissão`.
- `pronto (s) = t_resultado_terminal − t_submissão`.
- Separar `custo_real` (fatura/usage) de `custo_estimado`; se ambos faltarem,
  usar `desconhecido`, nunca zero.
- Para cada fornecedor e nível de concorrência, reportar `n`, falhas, mediana
  (p50) e p95 de `pronto (s)`. Com `n < 20`, p95 é apenas descritivo; com dados
  insuficientes, marcar `não conclusivo`.
- Verificar MP4 reproduzível, duração efetiva, codec, orientação e intervenção
  humana necessária antes da avaliação cega.

## Rubrica cega de qualidade

Dois avaliadores recebem arquivos com IDs aleatórios, sem fornecedor visível quando
isso for viável. Cada dimensão recebe 1–5: **1** inaceitável; **2** ruim; **3**
utilizável com ressalvas; **4** bom; **5** excelente. Guardar nota individual,
média, discordância absoluta e justificativa curta. Itens não aplicáveis não entram
na média e devem dizer por quê.

| dimensão | definição operacional |
| --- | --- |
| Lip-sync | coincidência percebida entre fonemas visíveis e áudio; só avaliar fala visível e compreensível. |
| Timbre | semelhança com a referência autorizada; não pontuar se não há referência. |
| Prosódia | ritmo, pausas, ênfase e entonação naturais em pt-BR. |
| Artefatos faciais | ausência de deformação, tremor, boca/dentes inconsistentes ou cortes estranhos. |
| Identidade | estabilidade do rosto/avatar ao longo do clipe; não comparar se o fornecedor não oferece o mesmo tipo de identidade. |
| Inteligibilidade pt-BR | palavras, números e sotaque entendidos sem esforço anormal. |
| Adequação 9:16 | enquadramento, rosto e boca adequados ao vertical, sem corte crítico. |

## Falhas, segurança e operação a observar

| Situação | Procedimento do estudo | Resultado a registrar |
| --- | --- | --- |
| entrada inválida/formato ou amostra insuficiente | Exercitar por mock ou documentação antes de qualquer chamada paga. | expectativa 400, motivo client-safe, nenhum job/custo. |
| credencial ausente/inválida | Não chamar serviço real sem chave; em mock, classificar 401. | mensagem sanitizada, sem segredo. |
| quota/pagamento | Simular 402 e não tentar contornar. | categoria, custo conhecido/desconhecido. |
| acesso de outro tenant ou recurso ausente | Validar apenas em mock futuro. | expectativa 403/404; nenhum vazamento. |
| 429, 5xx ou timeout | Não reenviar submissão ambígua; reconciliar primeiro. | limite/backoff documentado, `submissão_incerta` se sem ID. |
| concorrência acima do limite | Testar só com teto autorizado; caso contrário documentar o limite publicado. | pendente/rejeitado/erro, estado final não órfão. |
| polling/webhook/retomada | Verificar pela documentação e, se sandbox permitido, por uma única execução reconciliável. | suporte, ID, idempotência e comportamento de reinício. |

Uma futura integração deve ter timeout, sanitização por whitelist de
`provedor + código`, telemetria de falha parcial, idempotência/deduplicação e testes
de integração com mocks para sucesso, falha parcial, timeout, token expirado e
erro total. Não registrar payload, stack, token, mídia ou URL assinada.

## Regra de decisão

**Go para protótipo de integração**, e apenas protótipo, requer simultaneamente:

- HeyGen com pelo menos 8 de 9 saídas válidas na matriz principal;
- média >= 4 para lip-sync e inteligibilidade, e nenhuma média < 3;
- custo efetivo conhecido e abaixo do teto previamente autorizado;
- autorização, retenção/região e exclusão aprovadas;
- nenhuma falha crítica não mitigada.

**No-go** ocorre quando a evidência completa viola um desses limites.
**Inconclusivo** ocorre quando faltam credenciais, consentimento, orçamento, mídia
autorizada, custo efetivo, dois avaliadores ou amostras suficientes.

### Decisão atual

**Inconclusivo.** Não há credenciais, orçamento autorizado, amostras com
consentimento, contrato de retenção/região, execução real, fatura, avaliadores ou
saídas para pontuar. HeyGen segue como referência de benchmark por combinar avatar
e lip-sync documentados; OpenRouter segue como baseline de geração de vídeo, mas
não é equivalente para identidade vocal ou precisão labial. ElevenLabs só entra se
o caso pedir voz clonada reutilizável fora do avatar.

## Reprodutibilidade e validação desta fase

Comandos usados nesta fase documental:

```bash
git worktree add -b spec/1dfch0am2vr-voice-lipsync-benchmark \
  /home/diogo/fury-voice-lipsync-benchmark dev
git cat-file -e dev:apps/api/src/services/studio/studio-video.service.ts
git cat-file -e hmg:apps/api/src/services/studio/studio-video.service.ts
rg -n '(HEYGEN|ELEVENLABS|OPENROUTER)' .env.example apps/api/.env.example
```

Os dois `git cat-file` retornaram ausência do path nas bases versionadas; o último
comando não encontrou `HEYGEN` nem `ELEVENLABS` nos exemplos de ambiente da base.
O relatório deve ser revalidado contra documentação oficial e conta de teste no dia
em que qualquer experimento for autorizado.
