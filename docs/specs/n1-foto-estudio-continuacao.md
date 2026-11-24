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

## Estado e plano de validação

A PR #431 registra uma execução controlada posterior com a foto e o contexto originais, usando chamadas reais ao OpenRouter e repositório e cota simulados. Foram usados `google/gemini-3.8-flash` no aprimoramento, `black-forest-labs/flux.2-klein-4b` na geração com referência de equipe e `google/gemini-3.1-flash-image` na inclusão de texto. A revisão automática registrou `verified`, frase `Terapeuta de Dianética` e `corrected=false`. O relato anterior de indisponibilidade do conector e da chave descrevia uma tentativa anterior, não o estado dessa execução. A execução não é o request original e não valida tenant ou storage reais.

1. Obter os dois anexos do ticket em armazenamento privado. Em tenant de teste autorizado, registrar versão do código, configuração e modelo; capturar o request sanitizado, IDs e tipos das referências resolvidas, prompt final e `complianceNotes`, sem publicar imagens, tokens ou dados do cliente.
2. Repetir a geração ao menos três vezes com a mesma foto, contexto e configuração, registrando falhas e todas as saídas, sem selecionar apenas sucessos. Comparar cada saída final com a referência e o criativo reportado; registrar variação, idioma, legibilidade e número de ocorrências da frase. Uma execução isolada ou julgamento automático não prova consistência de identidade. Comparação visual humana é necessária pelo critério do ticket; não afirmar identidade apenas por similaridade subjetiva automatizada.
3. Exercitar upload, resolução tenant-bound e leitura da referência pelo storage real em ambiente de teste, incluindo referência de outro tenant e inexistente. Confirmar rejeição antes da cota. Não usar cota do cliente.
4. Executar os testes existentes de serviço e interface, incluindo texto explícito, fallback, contexto sem fato útil e referência inválida. Se houver defeito, escrever primeiro teste de sucesso, falha e borda, confirmar falha e implementar a correção mínima. O E2E simulado comprova payload, não a imagem ou integrações reais.
5. Revisar diff, atualizar a branch com `hmg` sem conflitos e verificar todos os checks no SHA final. Documentar resultados, inclusive falhas e limitações, na PR. Sem evidências das etapas 2 e 3, manter a entrega como incompleta; sem request original, não declarar causa raiz identificada.
