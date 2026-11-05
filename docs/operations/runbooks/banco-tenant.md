# Runbook: banco, migrations e isolamento de tenant

## Sinais

- Deploy inicia com relação, coluna, enum ou tabela inexistente.
- O validador indica migration ausente ou ela não foi executada.
- Dados de outro tenant aparecem numa consulta, cache ou projeção.

## Diagnóstico

1. Compare a versão de migrations aplicada com os arquivos em `packages/db/migrations`.
2. Confira a ordem do runner e se a imagem de produção contém os arquivos de
   migration necessários.
3. Para uma consulta afetada, confirme o `tenantId` no repository e a política
   RLS da tabela. Nunca use uma consulta global como atalho para investigar.
4. Verifique se upserts e índices únicos incluem a chave de tenant quando os
   dados vêm de provedores externos.

## Mitigação

- Pause somente a operação que depende do schema novo e aplique a migration
  pendente pelo procedimento de deploy aprovado.
- Se o isolamento for suspeito, interrompa a resposta daquele endpoint para o
  tenant afetado e trate como incidente P1 até confirmar o escopo.
- Não edite nem remova migrations já aplicadas. Crie uma migration corretiva.

## Correção definitiva e prevenção

- Migrations incrementais devem ser idempotentes quando a operação permitir,
  ter entrada no runner e possuir teste que verifica arquivo, schema e RLS.
- Acesso a persistência deve passar por repository tenant-bound; serviços e
  controladores não usam banco cru.
- Teste upgrade a partir de schema anterior, unicidade por tenant, ausência de
  tenant e tentativas de acesso cruzado.

## Evidências no histórico

- `98adb58` — `ADD COLUMN IF NOT EXISTS` em migrations existentes.
- `ecc0796` — migration faltante adicionada ao runner/validação.
- `fca9173` — migrations copiadas para imagem de produção.
- `af315fd` — repository de sync tenant-bound com upserts idempotentes.
- `46f112a` — migration de status de clientes em `meta_leads`.

## Critério de encerramento

O ambiente aplica todas as migrations na ordem esperada, a operação funciona em
schema atualizado e testes demonstram que não há leitura ou escrita entre tenants.
