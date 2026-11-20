# Cota para a jornada real de QA

A jornada com efeitos reais depende de aprovação manual e de assinatura vigente com saldo para uma geração mais margem aprovada. O pré-voo é apenas uma leitura, não reserva créditos. Uma falha bloqueia a campanha antes de sua criação; ela não prova que a jornada passou.

## Inventário e responsável

A URL do workflow aponta para API HMG. O tenant e a identidade/responsável operacional da conta QA não foram confirmados. O código armazena o saldo na assinatura e consome uma unidade por geração. Há implementação de renovação para assinaturas ativas vencidas, não cortesia, com agendador a cada duas horas; a implantação, estado e aplicabilidade à conta QA não foram verificados. Não presumir renovação automática da conta com base no código. A política antiga em `docs/politica-renovacao-creditos-e-planos.md` diverge da implementação atual.

Antes de habilitar a execução, o responsável de QA precisa confirmar tenant, ambiente, provisionamento, periodicidade efetiva e margem; registrar a aprovação e configurar as variáveis de repositório `QA_QUOTA_MARGIN` e `QA_QUOTA_OWNER`. Os valores ainda não foram aprovados nesta tarefa. O workflow falha fechado enquanto ausentes.

## Diagnóstico

- `configuration`: responsável ou margem não configurados; solicitar configuração ao responsável de QA.
- `quota_insufficient`: solicitar ao responsável de QA a reposição pelo processo autorizado do ambiente e verificar novamente o saldo por leitura; não executar recarga por este workflow.
- `ineligible`: solicitar verificação da assinatura ao responsável; não mudar plano automaticamente.
- `unknown`: dados insuficientes ou ambíguos; verificar plano e saldo com a equipe responsável.
- `permission`: verificar acesso da conta e credenciais no cofre, sem expô-las.
- `timeout` ou `unavailable`: verificar disponibilidade da API e repetir apenas a leitura após recuperação.

A confirmação de sucesso deve comparar o saldo lido da assinatura da conta de QA com uma geração mais a margem aprovada, e verificar status e vigência. Não compartilhar resposta bruta, credenciais ou dados pessoais. Uma rotina de aviso antecipado ainda precisa ser implementada e validada; o erro no início da jornada não substitui esse aviso.
