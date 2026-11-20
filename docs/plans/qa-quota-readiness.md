# Preparar cota QA — especificação e pendências

## Objetivo e critérios

A jornada manual só pode criar campanha após verificar, na conta autenticada e no endpoint read-only de assinatura, assinatura vigente e saldo numérico de ao menos uma geração (consumo observado no código) mais margem aprovada pelo responsável. Estado ausente, ambíguo, erro de permissão, indisponibilidade e timeout falham com motivo sanitizado. PR continua executando somente a jornada de leitura; o opt-in manual permanece obrigatório.

## Implementação

1. Consultar `GET /billing/subscription` após login e antes do wizard; não imprimir resposta ou credenciais. Validar status, prazo, plano e saldo; valores nulos são desconhecidos, mesmo que possam significar ilimitado.
2. Exigir `QA_QUOTA_MARGIN` (inteiro não negativo aprovado) e `QA_QUOTA_OWNER` no ambiente do workflow. Falta de configuração bloqueia. O cenário gera uma imagem; qualquer alteração no cenário exige revisão do consumo e da margem.
3. Cobrir limiar, configuração, estado desconhecido, permissões, erro e timeout com dados sintéticos; garantir ordem e ausência de mutações após falha; executar checks read-only no CI.
4. Implementar rotina read-only de aviso antecipado com responsável e instruções de verificação; testar a rotina e sua condição de falha. Não criar compra, alterar plano ou saldo.
5. Inventariar com responsável de QA a conta, tenant, ambiente, método de provisionamento, periodicidade efetiva e margem; documentar evidências e configurar variáveis. Validar somente em sandbox autorizado, sem repetir jornada HMG para este ticket.

## Situação

Os passos 1–4 têm implementação e testes locais; a entrega efetiva do aviso depende do agendamento na branch padrão e de notificações verificadas. O passo 5 permanece pendente: não há evidência do responsável, margem aprovada, tenant real, processo ou periodicidade efetivos. Sem esses dados não se pode configurar o gate nem considerar o critério operacional concluído. Nenhuma alteração de saldo está autorizada por esta especificação. A conta pode consumir cota entre o pré-voo e a geração; a leitura não reserva créditos. O próprio endpoint de geração continua responsável por aplicar o limite.

Referências: [geração](https://app.clickup.com/t/1dfch0anar8), [login demo](https://app.clickup.com/t/1dfch0anarb). Não alterar status desses cards.
