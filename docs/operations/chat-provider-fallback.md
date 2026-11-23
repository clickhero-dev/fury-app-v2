# Fallback OpenRouter do chat

> **Atualização para o serviço Python de chat:** as seções abaixo sobre fallback
> conversacional no OpenRouter descrevem a implementação anterior e não se
> aplicam ao novo runtime multiprovedor. Consulte `apps/chat/README.md` para a
> ordem OpenAI → Anthropic → OpenRouter, chaves, limites e segurança atuais.
> A seção “Rascunhos do executor de planos” continua documentando o adapter Node.

Fallback é **desativado por padrão**. Não existe modelo candidato automático.
Configure e homologue modelos explicitamente no ambiente do serviço chat:

```sh
CHAT_FALLBACK_MODELS='["vendor/modelo-homologado","vendor/outro-homologado"]'
CHAT_FALLBACK_CAPABILITIES='{"vendor/modelo-homologado":{"supported_parameters":["max_tokens","temperature","tools","tool_choice"],"vision":false},"vendor/outro-homologado":{"supported_parameters":["max_tokens","temperature","tools","tool_choice"],"vision":false}}'
```

Os IDs acima são placeholders, não recomendações de modelos disponíveis.
Também é aceito `CHAT_FALLBACK_MODELS=vendor/modelo-a,vendor/modelo-b`.
IDs exigem prefixo `vendor/`, caracteres alfanuméricos e `/._:-`, até 128
caracteres; limite de oito entradas antes da deduplicação, preservando ordem.
Configuração inválida impede a criação do cliente HTTP, com erro sanitizado.
Reinicie o serviço após mudar a configuração.

## Homologação e compatibilidade

Cada candidato precisa de entrada em `CHAT_FALLBACK_CAPABILITIES`.
`supported_parameters` deve listar **todos** os campos de topo que o serviço
enviará, exceto `model`, `messages`, `stream` e `stream_options`. Isso inclui
`max_tokens` (enviado pelo Agno), parâmetros de raciocínio, ferramentas,
`tool_choice` e parâmetros específicos de roteamento quando usados.
Homologar significa confirmar que o provedor/modelo aceita esses parâmetros
com a mesma semântica e os schemas/histórico de ferramentas do chat.
`vision: true` homologa entradas `image_url`; outras modalidades são recusadas.
O contexto e os schemas são preservados integralmente; parâmetros não são
removidos, convertidos ou reduzidos silenciosamente. Candidato incompatível é
ignorado e o retry pode continuar no principal. Não se consulta catálogo remoto.

## Limites e segurança

- Até **três tentativas totais por requisição HTTP de chat**, incluindo
  principal, fallback e retries; não três por modelo. Com dois candidatos
  elegíveis: principal → candidato 1 → candidato 2. Com um: principal →
  candidato 1 → candidato 1. Oito candidatos configurados não aumentam o limite.
- Apenas falhas transitórias (rede/timeout, 429, 5xx e erro SSE transitório
  detectado antes de saída) permitem troca. 400/401/403 não permitem fallback.
- Necessário `provider_retry_scope`; saída visível ou início de ferramenta
  marcado com `mark_provider_output()` proíbe replay no restante do turno.
  Erro após stream entregue não reinicia o stream.
- `Retry-After`, limite acumulado de espera de 20s e janela de retry de 200s
  permanecem válidos para a cadeia inteira. O prazo externo do turno continua
  responsabilidade do chamador; a janela de retry não substitui esse prazo.
- Cada corpo reescrito passa pelo mesmo guard de orçamento. O estimador é
  selecionado novamente pelo modelo: tokenizer local para o DeepSeek principal
  conhecido, limite conservador por bytes para os demais. Excesso aborta antes
  do envio, sem truncar contexto nem tentar contornar o guard.
- Cada chamada HTTP posterior do Agno começa no modelo principal original;
  fallback não muda permanentemente a configuração do agente.

O estado de `provider_retry_scope()` recebe `selected_model` e `fallback_used`
quando o transporte aceita uma resposta. São metadados da última resposta
aceita, **não prova de conclusão do turno** (um stream pode falhar depois).
Eles não incluem prompt, ferramentas, headers ou credenciais.
O cliente Agno/OpenAI deve manter retries próprios em zero para não multiplicar
as tentativas fora deste transporte.

O runtime aplica também o orçamento **persistido por mensagem original**:
duas retomadas, deadline de dez minutos, dezoito envios e 180.000 tokens
reservados. Cada tentativa principal/fallback e cada resumo conta antes do I/O.
Os três retries locais nunca ampliam esse orçamento global. Após saída entregue,
o worker pode retomar o turno a partir de seu checkpoint somente em modo leitura,
sem repetir efeitos confirmados ou incertos.

## Rascunhos do executor de planos

O adapter Node usa as mesmas variáveis opt-in, mas tem outro limite: **uma chamada
por tentativa persistida da tarefa, máximo duas**. A primeira usa o principal
existente do gerador de rascunhos; a segunda usa o primeiro candidato homologado
compatível ou retenta o principal. Não há retry adicional escondido no adapter.
Homologação de texto exige `temperature` e `max_tokens`; não expõe ferramentas.
Configuração inválida não habilita fallback nessa via. Configure ambos os serviços
quando quiser homologar a cadeia conversacional e a geração de textos dos planos.

Falhas transitórias admitem a segunda tentativa; auth, entrada ou orçamento não.
O contexto é JSON limitado, com `omittedTaskKeys` explícito, sem truncar resultados
originais no banco. Todo payload/modelo escolhido passa pelo guard conservador.
Critérios editoriais e coleta: `docs/operations/ady-editorial-evaluation.md`.

## Verificação

`PYTHONPATH=apps/chat python -m pytest apps/chat/tests/test_provider_fallback.py
apps/chat/tests/test_provider_retry.py apps/chat/tests/test_provider_continuity.py
apps/chat/tests/test_model_request_budget.py`

Testes usam Agno/OpenRouter reais com transporte HTTP simulado; não constituem
homologação de qualidade/capacidades de modelos em produção.
