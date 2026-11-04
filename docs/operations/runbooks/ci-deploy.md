# Runbook: CI, dependências, Docker e deploy

## Sinais

- CI falha em `frozen-lockfile`, resolução de workspace, build TypeScript ou
  teste que só quebra no pipeline.
- Imagem de produção não encontra migrations, pacote interno ou dependência.
- Um ajuste local funciona, mas o deploy usa artefato/configuração diferente.

## Diagnóstico

1. Leia o primeiro erro do log do CI; erros posteriores frequentemente são
   consequência de lockfile ou build de pacote interno.
2. Compare gerenciador de pacotes, versão de pnpm/Node, lockfile e Dockerfile
   usados no pipeline e na imagem afetada.
3. Confirme que pacotes de workspace requeridos são construídos antes de testes
   e que migrations são copiadas para o estágio final da imagem da API.
4. Para variável `VITE_*`, confirme o valor no momento do build, pois alterações
   posteriores de ambiente não mudam o bundle já gerado.

## Mitigação

- Reproduza com o mesmo comando e versão usados pelo pipeline antes de alterar
  dependências.
- Corrija lockfile e manifesto de forma consistente; não desative `frozen-lockfile`
  ou testes para liberar deploy.
- Para falha de migration em produção, aplique a migration pendente pelo checklist
  de deploy e valide o health check após o rollout.

## Correção definitiva e prevenção

- Fixar ferramentas e espelhar no CI o fluxo dos Dockerfiles.
- Tratar `pnpm-lock.yaml` como parte da mudança de dependência e validar build
  dos workspaces no CI.
- Adicionar teste ou etapa de imagem quando uma regressão só pode ocorrer no
  estágio de produção.

## Evidências no histórico

- `7eb6046` — sincronização do lockfile pnpm.
- `f4a13f5` — testes órfãos após refatoração e recuperação de coverage.
- `bac9227` — versão incompatível de `@bull-board` quebrando build no CI.
- `fca9173` — migrations disponíveis no Docker de produção.
- `d4a09bb` — lockfile standalone do web para deploy frozen.

## Critério de encerramento

CI e imagem de produção executam as mesmas versões e possuem os mesmos artefatos
necessários. O build, os testes relevantes e o health check pós-deploy passam sem
desabilitar verificações.
