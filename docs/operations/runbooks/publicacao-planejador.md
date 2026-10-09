# Runbook: publicação e planejador

## Sinais

- "Postar agora" falha, repete uma publicação ou fica em estado `publishing`.
- A Meta retorna erro 9007 ao publicar imagem ou stories.
- Um job de planejamento fica em recuperação mesmo após terminar com sucesso ou
  erro.

## Diagnóstico

1. Localize o post e confirme seu estado, tentativa, chave de idempotência e
   vínculo com o perfil Instagram selecionado.
2. Para erro 9007, consulte o estado do container de mídia. `media_publish` só
   pode ocorrer após `FINISHED` em imagem e stories.
3. Para tela presa, compare o estado persistido do job (`DONE`/`ERROR`) com a
   decisão da interface; não presuma que polling atrasado indica job ativo.
4. Verifique se uma tentativa concorrente possui lease/claim ativo antes de
   acionar retry.

## Mitigação

- Aguarde a confirmação de processamento da mídia e tente novamente pelo fluxo
  de retry idempotente; não chame publicação direta em paralelo.
- Caso uma tentativa esteja ativa, mantenha-a como dona da operação até expirar
  o lease ou finalizar. Investigue antes de liberar manualmente.
- Quando a recuperação do job contradiz o estado terminal persistido, atualize a
  tela a partir do estado terminal e registre a divergência.

## Correção definitiva e prevenção

- Use chave de idempotência, replay estrito e comportamento fail-closed para
  requisições concorrentes.
- Faça claim condicional com lease antes de publicar e persista o estado
  `publishing` para tornar a concorrência observável.
- Cubra rota, serviço, scheduler, retry, mídia não finalizada, requisição sem
  idempotência e job terminal na suíte de regressão.

## Evidências no histórico

- `194fdb8` — espera por `FINISHED` antes de `media_publish` para o erro 9007.
- `148dd97` — middleware de idempotência com Redis e replay estrito.
- `6170af8` — claim condicional com lease.
- `53b5863` — estado `publishing` no banco.
- `07874fa` — interface deixa a recuperação ao observar `DONE` ou `ERROR`.

## Critério de encerramento

Há no máximo uma publicação efetiva por intenção do usuário; a tentativa e seu
estado ficam auditáveis; o job terminal não deixa a tela bloqueada; e a publicação
usa somente o perfil Instagram selecionado.
