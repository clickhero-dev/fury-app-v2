# SPEC: cards para destino das mensagens

**Data:** 2026-11-05
**Status:** Em implementação

## Objetivo

Na criação de campanha com objetivo **Gerar Conversas** (`objective: 'whatsapp'`),
substituir os controles simples de Instagram e Facebook por cards clicáveis,
acessíveis e responsivos.

## Decisões confirmadas no código

- A escolha é **múltipla**, não exclusiva: `WizardWhatsappState.destinations`
  é uma lista e o `toggleDestination` atual adiciona/remove cada destino sem
  remover os demais.
- O contrato é preservado: Instagram continua `instagram_direct` e Facebook
  continua `messenger`, enviados em `destinations` pelo payload do wizard.
- A seção só é exibida para o objetivo `whatsapp`; os demais objetivos não
  passam por essa seleção.
- A validação existente permanece: é necessária uma Página e pelo menos um
  destino; quando WhatsApp estiver escolhido, também é necessário um número.

## Comportamento e acessibilidade

- Cada card é um `label` que contém um `input type="checkbox"`: toda a área
  ativa alterna a seleção por mouse, toque, Enter/Espaço no checkbox e leitor
  de tela.
- O checkbox mantém a semântica nativa (`checked`) e o card expõe o estado por
  `data-state`; foco visível, ícone de confirmação e texto "Selecionado"
  tornam o estado perceptível além da cor.
- Os cards exibem logo, nome e descrição. Em telas pequenas ficam em uma
  coluna; a partir de `sm`, ocupam duas colunas sem reduzir a área de toque.
- A mesma peça visual é usada também no passo Público, acessível ao editar o
  fluxo, para não haver divergência de comportamento.

## Cobertura

- Unitária do card: semântica, clique em toda área, teclado, seleção e
  desseleção, logos e classes estruturais responsivas.
- Unitária do hook: destino obrigatório e múltipla seleção continuam válidos.
- Unitária do payload: Instagram e Facebook são preservados juntos.
- E2E local: cria uma campanha no fluxo real do wizard com os dois destinos e
  confirma o payload enviado.
