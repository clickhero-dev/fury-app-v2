# Avaliação editorial e homologação do Ady

O gate verifica evidências fornecidas pelo operador; **não fabrica notas de
qualidade e não faz chamadas pagas**. Uma resposta bem formada não prova que a
estratégia é boa. A revisão humana e a amostra real continuam obrigatórias.

## Cenários mínimos

```sh
PYTHONPATH=apps/chat python -m editorial_evaluation --cases
```

O manifesto cobre: negócio conhecido sem ideia, contexto insuficiente, Instagram
desconectado, foto ausente, cota de vídeo esgotada, preços conflitantes, falha de
provedor e planejamento da semana. São cenários fictícios, não dados de clientes.

## Coleta controlada

1. Usar ambiente isolado, dados autorizados e ferramentas externas simuladas.
2. Fixar versão da política e registrar o modelo exato. Não usar aliases móveis
   para comparar resultados de dias diferentes.
3. Medir tempo até resposta concluída, custo efetivo observado, respostas digitadas
   **obrigatórias** e resultado. Clique em sugestão não é resposta digitada.
4. Conferir que nenhuma ferramenta de confirmação/publicação foi exposta ao modelo.
5. Um revisor humano avalia cada amostra de 1 a 5:
   - `relevance`: a entrega combina com o negócio?
   - `simplicity`: a pessoa avança sem briefing/jargão?
   - `supported_claims`: fatos e promessas têm evidência?
   - `next_step`: há próximo passo útil e compreensível?
   - `non_repetition`: evita repetir conteúdo e perguntas respondidas?
6. Testar falhas antes/depois de consultas, mudança de modelo, revogação de acesso
   e reinício. Não publicar nem consumir cota de mídia real como parte da coleta
   sem autorização e orçamento separados.

Armazenar amostras em local privado com retenção definida; não comitar prompts,
respostas de clientes, tokens ou arquivos reais. O revisor é responsável pela
veracidade dos campos `source`, custos e notas. O CLI não autentica o revisor.

## Formato de amostra

Arquivo privado contendo um array:

```json
[
  {
    "case_id": "florist_no_idea",
    "model": "vendor/modelo-homologado",
    "source": "live",
    "response": "ADY_MESSAGES:{\"messages\":[\"Legenda pronta para revisar.\"],\"clarify\":{\"question\":\"Próximo passo\",\"choices\":[\"Preparar arte\",\"Outra ideia\"]}}",
    "tool_calls": ["profile", "brand"],
    "latency_ms": 900,
    "cost_usd": 0.001,
    "required_typed_replies": 0,
    "outcome": "completed",
    "human_ratings": {
      "relevance": 4,
      "simplicity": 5,
      "supported_claims": 5,
      "next_step": 4,
      "non_repetition": 4
    }
  }
]
```

Esse exemplo ilustra o **formato**, não constitui evidência real. Usar
`source: "synthetic"` para fixtures e simulações; elas não aprovam homologação.
Resultados admitidos: `completed`, `recovered`, `failed`, `cancelled`.

## Executar gate

```sh
PYTHONPATH=apps/chat python -m editorial_evaluation \
  --samples /caminho/privado/amostras.json \
  --output /caminho/privado/relatorio-agregado.json
```

- Exit **0**: todos os modelos apresentados têm cobertura de todos os cenários,
  amostras declaradas reais, revisão humana completa e todas as notas ≥4; limites
  de digitação e escolhas respeitados, sem ferramenta externa não autorizada.
- Exit **1**: evidência incompleta, sintética ou reprovada.
- Exit **2**: entrada inválida.

O relatório não inclui respostas ou dados do negócio: apenas modelo, IDs de
cenários, motivos de reprovação, cobertura e medidas agregadas. Custo/latência
não recebem meta arbitrária; comparar com a linha de base e orçamento do produto.
Um modelo elegível não entra automaticamente no fallback. Atualizar configuração
homologada, revisar capacidades/privacidade/custo e fazer rollout controlado.

## Métricas de operação

`assistant_metrics.py` emite eventos opcionais para o coletor configurado:
início, resposta concluída, esclarecimento, falha, recuperação, cancelamento e
aprovação concluída. Identificador da operação é hash de UUID, sem identidade,
texto, parâmetros de ferramentas ou diagnóstico. Timeout do coletor é um segundo;
indisponibilidade de métricas nunca autoriza ação ou impede a recuperação.

`draft_ready` significa resposta concluída no runtime, **não aprovação de qualidade
editorial**. Ausência de evento não comprova abandono, pois telemetria é best-effort.
Cruzar métricas agregadas com estado persistido e avaliações humanas antes de
decidir metas. Não confundir cliques, confirmação de plano e autorização de gasto.
