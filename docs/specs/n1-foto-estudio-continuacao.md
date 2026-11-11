# [N1] Foto do estúdio estranha — especificação de continuação

## Resultado e critérios

- A foto de equipe selecionada deve pertencer ao tenant, ser enviada como referência e produzir pessoa observavelmente consistente. Rejeitar referência inválida antes da cota. Confirmar em geração real, com comparação visual e repetição suficiente para registrar variação; testes simulados não comprovam fidelidade.
- A Criação Rápida sem modelo deve oferecer texto explícito, sem texto e sugestão a partir do contexto. A frase explícita em português deve ser enviada literalmente para revisão de texto, mesmo se o aprimoramento falhar. Exigir frase não vazia, sem aspas ou quebras de linha; limitar seu comprimento. A frase deve aparecer uma vez e legível, ou a revisão deve registrar falha verificável.
- Em modo automático com fotos, derivar apenas de fatos explícitos; quando não há fato útil, não inserir texto. No modo sem texto, solicitar ausência de texto. Em todos os casos, avisar que a fidelidade da pessoa pode variar e orientar conferência.
- Preservar o fluxo de modelo anexado, sua edição de textos e os contratos já existentes; não alterar cota nem autorização.

## Etapas e evidências

1. Reproduzir o relato com a foto e o contexto originais em tenant controlado; registrar request de aprimoramento, request de geração, modelo, IDs e tipos das referências resolvidas, prompt final e complianceNotes sem expor dados sensíveis. Comparar resultado com referência e com o resultado reportado.
2. Manter testes de isolamento por tenant, rejeição antes da cota, derivação e revisão da headline da PR #424. Acrescentar testes dos três modos, entrada inválida, falha do aprimoramento e envio na interface, antes da implementação.
3. Implementar escolhas na interface e preservar o marcador consumido pela revisão existente; aplicar a escolha também no fallback. Validar o fluxo com navegador e API simulada, sem tratar esse teste como evidência da imagem.
4. Executar geração real, conferir fidelidade, idioma, legibilidade e ocorrência da frase. Se falhar, investigar modelo e referências, corrigir e repetir; registrar falha e limitações com evidências. Executar build, testes relevantes e CI, atualizar com hmg e verificar conflitos.

## Estado desta continuação

A reprodução do passo 1 ainda não foi realizada: o conector ClickUp atingiu o limite diário e a chave do provedor não está disponível neste ambiente. A implementação de interface é parcial até que os passos 1 e 4 sejam concluídos; não prova que o sintoma visual foi resolvido. O E2E usa respostas simuladas e não valida as integrações periféricas nem o resultado visual.
