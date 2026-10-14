# Runbook: Meta, OAuth e permissões

## Sinais

- O onboarding ou o wizard informa permissão insuficiente, exige reconexão ou
  retorna uma conta/página diferente da selecionada.
- A publicação ou a criação de formulário falha mesmo com conexão Meta exibida
  como ativa.
- O callback volta para o ambiente errado após autenticação.

## Causa confirmada neste incidente

O aplicativo Meta está em modo de desenvolvimento e não possui acesso avançado à
permissão `pages_manage_ads`. Enquanto essa condição persistir, o fluxo deve ser
testado somente com usuários que tenham função no aplicativo e não deve ser
tratado como uma falha de seleção de conta do cliente.

## Diagnóstico

1. Identifique o fluxo e o ambiente de origem sem copiar o token para tickets,
   logs ou chat.
2. Confirme a seleção persistida de conta de anúncio, página e perfil Instagram.
   Uma conexão válida não prova que o ativo certo está selecionado.
3. Consulte o erro normalizado e o código da Meta. Erros de escopo, checkpoint e
   verificação de conta devem resultar em instrução de reconexão compreensível.
4. Confirme que o `redirect_uri` corresponde ao host que iniciou o fluxo e que
   os escopos são compatíveis com a operação solicitada.
5. No painel Meta, confirme o modo do aplicativo e o status de acesso avançado
   de `pages_manage_ads` antes de investigar tokens, cache ou seleção de ativos.

## Mitigação

- Oriente reconectar a Meta e selecionar explicitamente os ativos solicitados.
- Para o incidente confirmado, solicite acesso avançado a `pages_manage_ads` e
  mantenha os testes restritos aos usuários com função no app enquanto ele estiver
  em desenvolvimento.
- Se o fluxo tiver voltado ao host errado, interrompa novas tentativas até corrigir
  a origem/redirect configurado; repetir o OAuth preservando a origem errada não
  resolve o problema.
- Para erro de permissão de formulário, apresente o escopo necessário e a ação
  de reconexão. Não substitua por um erro 500 genérico.

## Correção definitiva e prevenção

- Derivar a origem de retorno de um estado assinado/controlado pelo servidor e
  validar o callback antes de persistir a conexão.
- Normalizar os erros do provedor para códigos client-safe e cobrir a interface
  de reconexão com testes.
- Verificar no servidor o perfil Instagram vinculado antes de publicar; não usar
  um fallback silencioso para a primeira página disponível.

## Evidências no histórico

- `4539b69` — diagnóstico de `pages_manage_metadata` e ação de reconexão.
- `ae8ef0d` — uso de Page Access Token na criação do formulário.
- `2551dab` — escopos Meta e `auth_type=rerequest` na reconexão.
- `755f365` e `02cc325` — retorno OAuth para a origem que iniciou o fluxo.
- `c371185` — publicação limitada ao perfil Instagram vinculado.

## Critério de encerramento

O fluxo conclui com o ativo escolhido, em seu ambiente de origem, e a operação
autorizada é executada. A correção inclui teste do erro de escopo/conta errada e
não expõe token, payload ou stack trace ao usuário.
