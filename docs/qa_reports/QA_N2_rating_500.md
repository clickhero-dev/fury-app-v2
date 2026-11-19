# [N2] Corrigir erro 500 ao salvar avaliação de criativo

Ticket relacionado: [Avaliação do criativo após geração](https://app.clickup.com/t/1dfch0amj6h).

## Evidência e limites

Relato PostHog: 7 exceções backend entre 10–17/11/2026 UTC, 4 nas últimas 24 horas; 2 erros web de produção. Sem ambiente nos eventos backend, não somar eventos como usuários nem atribuir todos à produção. A mensagem externa não contém SQLSTATE ou catálogo do ambiente afetado.

Não havia PR aberta relacionada. `origin/hmg` ecd4206c já incorpora #408 e #456: esta última registrou a migration 0059 no executor e exige a tabela no boot. A DDL contém UNIQUE (tenant_id,user_id,creative_asset_id), exatamente o alvo do upsert. Não há fundamento para criar um índice duplicado. A conexão do `.env` local (NODE_ENV=development) recusou conexão; não representa confirmação de schema em homologação ou produção.

## Especificação e sequência

1. Preservar WIP em worktree isolada baseada em hmg. Ler repository, service, middleware de erro, schema e executor; reaproveitar a correção já incorporada.
2. Testar primeiro: reproduzir SQLSTATE 42P01 (relação ausente) e 42P10 (sem arbiter de conflito) em schemas transacionais isolados; aplicar a DDL real e executar o upsert do repository em PostgreSQL 16 dedicado. Distinguir causas possíveis da causa ainda não confirmada do incidente.
3. Complementar testes de repository: inserção, atualização, createdAt estável, concorrência, dois usuários, dois tenants, lookup isolado, FK de asset ausente e CHECK de nota inválida. Manter integração HTTP existente 200/400/401/403/404.
4. RED/GREEN: validar no boot a constraint única imediata e válida definida pela migration. Tabela existente sem constraint não deve iniciar uma API incapaz de salvar. Não reparar schema compartilhado nem modificar migration histórica sem evidência de drift.
5. RED/GREEN: acrescentar ambiente às exceções backend. APP_ENV identifica implantação (production/staging/hmg); fallback NODE_ENV, depois unknown. Não deduzir produção de hostname ou de eventos históricos.
6. E2E mockado com API inteiramente interceptada em localhost: gerar resultado, aguardar convite, enviar nota, receber falha segura, preservar seleção, reenviar e confirmar fechamento. Nenhuma conta ou serviço real.
7. Rodar regressões focadas, build e CI remoto. Revisar diff, atualizar contra origin/hmg e abrir PR para hmg com título N2. Sem merge ou deploy.

## Critérios de aceite verificáveis

- DDL real permite upsert idempotente e testes distinguem ausência da relação de ausência da constraint; não atribuir automaticamente um dos casos ao incidente.
- Repository e HTTP cobrem persistência, isolamento e rejeições sem linhas inválidas.
- Boot rejeita schema sem arbiter compatível; schema válido permite inicialização. Falha de catálogo também impede boot.
- Exceção backend contém environment explícito e conserva sanitização; configuração ausente tem fallback testado.
- Navegador mockado demonstra erro recuperável e sucesso sem requisições a contas reais.
- PR sem conflitos, atualizada com hmg e CI verde. Qualquer falha externa deve ser registrada, sem enfraquecer gates.

## Pendências de implantação

Confirmar em cada ambiente o SHA implantado, registro 0059 em __drizzle_migrations e definição real de pg_constraint/pg_index. Antes de qualquer reparo, obter SQLSTATE e comparar schema com DDL. O acesso local indisponível impede afirmar essa verificação concluída.

Após implantação pelo responsável, configurar APP_ENV distintamente em hmg/produção e consultar exceções de PUT /api/studio/assets/:id/rating por environment/source. Conferir zero HTTP 500 em janela com envios válidos observados (zero tráfego não comprova correção). Comparar 24h e 7d por ambiente; não somar browser/backend como usuários únicos. Não houve deploy nesta tarefa, portanto queda a zero ainda não foi demonstrada.

## Consulta de auditoria (somente leitura, por ambiente)

Executar com conexão explicitamente selecionada pelo operador; não usar uma URL padrão nem imprimir credenciais:

```sql
BEGIN READ ONLY;
SELECT hash, created_at FROM public.__drizzle_migrations
WHERE hash = '0059_creative_asset_ratings';
SELECT to_regclass('public.creative_asset_ratings');
SELECT c.conname, c.condeferrable, pg_get_constraintdef(c.oid),
       i.indisvalid, i.indisready
FROM pg_constraint c LEFT JOIN pg_index i ON i.indexrelid = c.conindid
WHERE c.conrelid = to_regclass('public.creative_asset_ratings');
ROLLBACK;
```

Risco operacional: a nova validação impede o boot se a tabela existir sem a constraint canônica imediata e válida. Isso evita servir um endpoint sabidamente incompatível, mas não repara drift. Auditar antes da implantação. Rollback da aplicação restaura a validação anterior sem alterar dados ou DDL.

## Evidências locais

- RED: 6 falhas esperadas (constraint ausente e ambiente ausente); 5 testes já verdes.
- PostgreSQL 16 dedicado, porta 32842: executor aplicou migrations, incluindo 0059. Reproduções em schemas transacionais confirmaram 42P01 e 42P10; DDL real permite INSERT/UPDATE ON CONFLICT com createdAt preservado.
- API: 44 testes aprovados em 8 arquivos; inclui repository real, integração HTTP, erros client-safe, catálogo e telemetria.
- Web: 47 testes aprovados e 1 skip preexistente; instalação standalone pnpm como no CI. Primeira tentativa com dependências npm misturou versões de Vitest e falhou em matchers, resolvida pela instalação correta sem mudar testes.
- E2E Chromium: 1 cenário aprovado, API inteiramente mockada, falha 500 seguida de reenvio 200. Tráfego externo bloqueado pelo teste.
- Build shared/db/API/web aprovado. Não houve migração compartilhada, deploy nem envio de nota a conta real.
