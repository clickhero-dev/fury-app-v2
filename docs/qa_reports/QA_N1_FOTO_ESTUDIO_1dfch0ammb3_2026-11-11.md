# QA — Foto do estúdio estranha (1dfch0ammb3)

PR #424, base hmg. Avaliação em 11/11/2026: **não aprovada**.

O Playwright da Criação Rápida passou localmente (1 teste), com respostas simuladas: confirma o envio dos tipos e IDs das fotos selecionadas, não a geração real. Os seletores das fotos foram limitados ao diálogo, pois o painel e o diálogo podem apresentar botões com o mesmo nome. A execução exibiu erros de consultas não simuladas e de carregamento da imagem simulada; a asserção passou, mas o teste não valida essas integrações. Na validação anterior do mesmo commit, os testes focados do serviço, controller e OpenRouter passaram (58 testes).

O GitHub informou MERGEABLE; não havia conflitos a resolver. A PR #395, substituída pela #424, já estava fechada. Os checks de navegador e jornada real estavam em reexecução no momento da avaliação; consultar o resultado no commit final.

A especificação posterior registrada no card requer campo explícito de texto, ausência explícita de texto, revisão de identidade e aviso persistente. A PR atual deriva texto do contexto e não demonstra esses comportamentos. Não houve geração controlada com provedor, imagem de teste consentida ou comparação visual; identidade, legibilidade e idioma não foram comprovados. O teste simulado não substitui essa evidência. A entrega necessita implementação e cobertura desses requisitos e CI verde antes de ser considerada pronta.
