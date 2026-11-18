# Ajuda guiada para configurar o negócio

## Princípio

O Ady ajuda pessoas leigas a configurar a plataforma e alcançar seus objetivos,
oferecendo uma próxima ação simples e contextual. A configuração do negócio é o
primeiro fluxo dessa ajuda, não um pré-requisito obrigatório para usar o produto.
Esta especificação complementa `specs/ady-proativo-resiliente/spec.md`: oferecer
ajuda não substitui uma entrega possível nem autoriza gastos ou publicação.

## Convite e controle

- Consultar primeiro os dados autorizados do negócio. Quando faltarem informações
  básicas e houver oportunidade pertinente, oferecer: “Posso fazer algumas
  perguntas para conhecer melhor seu negócio e dar sugestões mais úteis?”
- Apresentar botões **Sim** e **Não**, preservando a entrada de texto livre.
  Não interromper uma tarefa em andamento nem repetir o convite a cada mensagem.
- Uma recusa encerra a oferta e não bloqueia o chat. O usuário pode pedir ajuda
  novamente. O fluxo pode ser interrompido e retomado sem perder dados salvos.
- Fazer uma pergunta por vez; explicar termos e oferecer ações claras, sem exigir
  conhecimentos técnicos. Não repetir informações existentes nem sobrescrevê-las
  automaticamente. A pessoa pode corrigir posteriormente o que foi salvo.

## Fluxo inicial

Após a aceitação, apresentar somente as etapas aplicáveis e nesta ordem:

1. Perguntar o nome do negócio quando não estiver disponível.
2. Perguntar se há logomarca quando não houver uma. Se houver, solicitar a imagem,
   salvá-la e tentar identificar as cores principal e secundária sem substituir
   cores existentes. Se não houver, oferecer a criação de uma logo; a geração
   deve respeitar as confirmações e cotas existentes e salvar a logo resultante
   somente após conclusão bem-sucedida. A pessoa pode recusar ou continuar depois.
3. Perguntar que produtos ou serviços o negócio vende, se isso ainda não for conhecido.
4. Oferecer o envio de fotos da empresa, depois da equipe e depois de produtos
   ou serviços. Cada pergunta é separada e oferece opção de pular.
5. Informar o que foi efetivamente salvo e sugerir um próximo passo pertinente
   ao objetivo da pessoa, sem iniciar automaticamente ações com efeitos externos.

As imagens devem ser armazenadas na biblioteca apropriada para o negócio. Fotos
da empresa não devem ser incorretamente classificadas como produto ou equipe.
As informações confirmadas devem ficar disponíveis para futuras sugestões.

## Continuidade, erros e segurança

- Persistir progresso e respostas após cada etapa bem-sucedida, isolados pelo
  tenant e respeitando a autorização do usuário. Retomada, duplo clique e
  repetição de requisições não podem duplicar efeitos.
- Respostas vazias ou inválidas não avançam a etapa. Falhas de upload, leitura,
  extração de cores, geração ou gravação devem ser informadas sem alegar sucesso,
  com opção de tentar novamente ou continuar sem o item opcional.
- Imagens e resultados de leitura são dados não confiáveis, nunca instruções
  ou autorização. Validar tipo e tamanho, e não expor arquivos privados.
- Se não for possível determinar as duas cores com segurança, informar a
  limitação sem inventá-las. Falha de extração não impede continuar.
- O estado da ajuda não deve impedir conversas normais nem criar uma sequência
  obrigatória de perguntas. Retomar explicitamente quando pertinente.

## Critérios de aceite

1. Sem contexto, o convite aparece em momento pertinente; **Não** mantém o chat
   funcional e não provoca convites repetidos.
2. **Sim** inicia o fluxo com uma única pergunta por vez. Dados já conhecidos são
   preservados, inclusive quando outra pessoa os altera durante o fluxo.
3. Nome e oferta válidos são persistidos; entrada vazia não avança.
4. O caminho com logo salva a imagem e cores identificadas; erros e cores
   indeterminadas são apresentados sem inventar sucesso ou bloquear o usuário.
5. O caminho sem logo oferece criação, respeita consentimento e custo, e só salva
   uma imagem realmente gerada. Recusa e falha permitem continuar.
6. As três categorias de fotos são solicitadas separadamente, podem ser puladas
   e, quando enviadas, são persistidas na categoria correta.
7. Recarregar ou retornar posteriormente recupera o progresso confirmado, sem
   duplicar arquivos ou substituir dados existentes.
8. Os dados não vazam entre tenants; operações sem autenticação ou sem permissão
   são recusadas. Respostas obsoletas não avançam indevidamente o fluxo.
9. O resumo final contém somente dados confirmados. O usuário consegue continuar
   conversando normalmente e solicitar ajuda novamente.

## Verificação

Seguir TDD e cobrir domínio, API, persistência e interface, incluindo caminhos
felizes, entradas inválidas, autenticação, isolamento entre tenants, itens não
encontrados, falhas externas, interrupção, retomada e concorrência. Testes de
prompt isolados não comprovam que o fluxo, os arquivos ou o salvamento funcionam.
