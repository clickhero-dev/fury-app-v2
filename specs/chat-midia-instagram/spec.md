# Mídia no chat e compartilhamento no Instagram

**Status:** proposta para implementação e validação; esta spec não implementa os fluxos.

## Objetivo e escopo

Permitir que o usuário visualize e baixe imagens e vídeos enviados no chat e,
quando o agente criar uma mídia, ofereça ações para baixá-la ou compartilhá-la no
Instagram. A experiência de visualização deve ser semelhante à do WhatsApp,
sem exigir a reprodução exata de sua interface.

Aplica-se a imagens e vídeos exibidos em mensagens enviadas ou recebidas, inclusive
gerados pelo agente e recuperados do histórico. As opções de Instagram aplicam-se
às mídias criadas pelo agente; anexos comuns continuam com visualização e download.
Áudio, documentos e publicação automática não fazem parte deste escopo.

## SPEC-01 — Visualização e download no chat

1. Cada imagem ou vídeo disponível no chat apresenta um ícone de download
   identificável, com nome acessível “Baixar imagem” ou “Baixar vídeo”.
   Acioná-lo baixa a mídia correspondente sem abrir o visualizador nem publicar.
2. Clicar ou tocar na imagem ou no vídeo abre um visualizador em tela cheia
   sobre o chat, preservando proporção e permitindo ver a mídia inteira. No vídeo,
   controles de reprodução, pausa e volume devem estar disponíveis.
3. O visualizador possui controle de fechar visível e acessível; fechar retorna à
   mesma conversa e posição, sem perder texto em edição. Escape fecha no desktop;
   foco retorna ao elemento que abriu o visualizador.
4. Funciona em desktop e dispositivos móveis, com teclado e leitor de tela.
   O download continua disponível no visualizador. Os controles não devem
   impedir que o usuário abra a mídia ou reproduza o vídeo.
5. Se mídia indisponível, expirada ou download falhar, informar o usuário e
   permitir nova tentativa quando aplicável, sem navegar para fora do chat nem
   declarar sucesso. Não oferecer arquivo de outro usuário ou tenant.

## SPEC-02 — Ações após criação pelo agente

Após cada imagem ou vídeo criado com sucesso, inclusive ao reabrir o histórico,
apresentar na própria entrega as ações **Compartilhar no Instagram** e **Baixar**.
Não exibir ações de mídia concluída para geração pendente ou falha. Baixar é
independente da conexão Meta.

Consultar o estado da integração do tenant e a capacidade de publicação usando os
mecanismos existentes, sem pedir ao agente para deduzir estado a partir de texto:

| Estado verificado | Comportamento |
| --- | --- |
| Instagram conectado e publicação autorizada | Oferecer compartilhamento e download; não pedir autorização novamente. |
| Instagram não conectado ou não selecionado | Oferecer também **Conectar Instagram e dar permissão**, iniciando o fluxo existente de integração Meta. Compartilhamento fica indisponível até concluir a conexão e a autorização. |
| Conta conectada, mas permissão de publicação ausente ou revogada | Manter a opção de compartilhar indisponível e explicar como recuperar a permissão pelo fluxo existente de integração. Não apresentar a conta como desconectada nem exibir o botão específico para conta não conectada. |
| Token expirado, acesso restrito, erro, consulta pendente ou estado desconhecido | Não afirmar que a conta está desconectada nem que pode publicar. Informar o estado quando conhecido e oferecer reconexão ou nova verificação conforme o caso; download permanece disponível. |

Após retorno bem-sucedido da integração, revalidar o estado para o tenant e
atualizar as ações sem perder a conversa ou a mídia. Cancelamento, recusa ou falha
não são autorização; permitir continuar no chat e tentar novamente. A autorização
concedida é reutilizada nas próximas mídias e sessões enquanto válida; se for
revogada ou expirar, orientar a recuperação necessária. Não solicitar OAuth a cada
entrega nem confundir o consentimento de integração com aprovação de publicação.

## SPEC-03 — Compartilhamento seguro

1. Compartilhar é uma ação explícita do usuário, nunca consequência de gerar,
   visualizar, baixar ou conectar a conta. Antes de publicar, o usuário deve
   poder revisar a mídia, conta de destino e eventual legenda, e confirmar a
   publicação; cancelar não publica nem agenda.
2. Revalidar no servidor a identidade, o tenant, a posse/acesso à mídia e a
   conta/capacidade de publicação antes do efeito externo. A interface não é
   fonte de autorização. Não expor tokens no chat ou no navegador.
3. Reutilizar o fluxo de publicação existente quando compatível; não prometer
   suporte a formato, tamanho, duração ou destino que a integração não aceite.
   Para mídia incompatível, explicar o impedimento e preservar o download.
4. Apresentar publicação em andamento e resultado confirmado; só dizer
   “publicado” após confirmação. Em falhas ou resultado incerto, explicar o
   estado sem afirmar sucesso nem repetir automaticamente uma operação que possa
   duplicar a publicação. Cliques repetidos e reabertura não devem duplicá-la.
5. Se houver mais de uma conta elegível, identificar claramente a conta de destino
   e permitir escolhê-la antes da confirmação; nunca publicar em outra conta
   silenciosamente.

## Referências existentes e limites

- `apps/api/src/services/meta/meta-healthcheck.service.ts`: `instagramPublish`
  distingue conta não selecionada, permissão `instagram_content_publish`
  ausente e verificação bem-sucedida. É diagnóstico de leitura, não garantia de
  que uma publicação futura terá sucesso; considerar atualidade e erros da consulta.
- `apps/api/src/services/chat/chat-read-capabilities.ts`: diagnóstico do chat
  verifica conexão e acesso ao Instagram, mas seus escopos avaliados são de
  anúncios/Páginas e não comprovam permissão de publicação.
- `specs/010-calendario-interativo/acceptance-criteria.md`: referência para
  publicação de imagem e reel; não pressupor que o fluxo agendado seja idêntico
  à publicação imediata do chat.
- `specs/ady-proativo-resiliente/spec.md`: geração e publicação exigem
  confirmações específicas; autorização de integração não autoriza publicar.

## Critérios de aceite e testes a implementar

- **CA-01:** imagem e vídeo enviados, recebidos e gerados, inclusive no histórico,
  exibem download; o arquivo correto é baixado sem abrir visualizador.
- **CA-02:** abrir cada tipo mostra mídia em tela cheia; fechar pelo botão ou
  Escape retorna à conversa, posição, rascunho e foco. Vídeo possui controles.
- **CA-03:** desktop, mobile, teclado e leitor de tela permitem abrir, baixar e
  fechar; controles têm nomes acessíveis e não se sobrepõem indevidamente.
- **CA-04:** mídia indisponível, URL expirada ou falha de download mostra erro
  recuperável, sem falso sucesso ou acesso entre tenants.
- **CA-05:** cada geração concluída de imagem e de vídeo oferece compartilhar e
  baixar; gerações pendentes ou falhas não oferecem ações de mídia concluída.
- **CA-06:** conectado e autorizado não vê pedido de permissão; desconectado vê
  botão de conexão; conectado sem permissão recebe orientação de recuperação sem
  ser classificado como desconectado.
- **CA-07:** consulta pendente, timeout, token expirado e estado desconhecido
  não são tratados como desconexão confirmada; download continua funcionando.
- **CA-08:** conexão concluída revalida ações sem perder contexto; cancelamento,
  recusa e erro não concedem acesso. Nova geração e nova sessão reutilizam
  autorização válida; revogação ou expiração aciona recuperação.
- **CA-09:** compartilhar exige revisão e confirmação; cancelar, baixar, abrir,
  gerar ou conectar nunca publicam. Conta de destino é clara, inclusive com
  múltiplas contas.
- **CA-10:** servidor rejeita usuário não autenticado, tenant errado, mídia
  inexistente/inacessível e permissão ausente; formato incompatível tem mensagem
  útil. Erros Meta não produzem falso sucesso ou duplicação em cliques repetidos,
  recarga e resultado incerto.

Esses critérios são cenários de teste futuros, não evidência de implementação.
