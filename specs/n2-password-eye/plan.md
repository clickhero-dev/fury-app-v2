# [N2] Botao do olhinho pra exibir senha em campos protegidos

## Objetivo e escopo
Permitir conferir o valor digitado em todos os campos protegidos que ainda não oferecem visualização. A busca inicial no GitHub por `olhinho` e `senha` não encontrou PR aberta relacionada. Base: `hmg`.

Campos abrangidos: senha atual, nova senha e confirmação em Configurações; acesso administrativo; criação de cliente, parceiro e usuário (incluindo modal de usuário do cliente); chave de IA em Integrações. Login, cadastro, recuperação e modais de senha já possuem controles de visualização e serão preservados.

## Decisões
- Componente de UI `PasswordInput`, sem dependência de API, domínio ou persistência. ADR-0001 e ADR-0002 não exigem alterações para esta mudança exclusivamente visual.
- Estado local por instância, inicialmente oculto; nenhuma persistência da preferência.
- Preservar classes, callbacks, referências e atributos nativos. Reservar espaço à direita para o ícone Eye/EyeOff.
- Botão de tipo button, acessível por Tab/Enter/Espaço, nome Mostrar/Ocultar senha (ou chave), aria-pressed e aria-controls. Ícone decorativo. Campos disabled bloqueiam também o botão; readOnly permite conferir o valor.
- Marcar o campo e seu contêiner para mascaramento/exclusão de captura do PostHog mesmo com type=text, usando data-ph-no-capture, ph-no-capture e ph-mask.
- Não alterar validação, envio, permissões, endpoints ou expor segredos já salvos no servidor.

## Critérios de aceitação
1. Cada campo abrangido inicia com type=password e um botão com ícone de olho.
2. Clicar ou usar teclado alterna somente o campo associado entre text/password, sem perder o valor, disparar onChange ou enviar formulário.
3. O botão informa ação e estado aos leitores de tela e mantém foco visível.
4. Campo vazio, readOnly, disabled, valor controlado, ref e atributos de validação continuam funcionando.
5. Campos múltiplos alternam independentemente; remontagem volta ao estado oculto.
6. Marcação de privacidade permanece ativa ao revelar.
7. Formulários continuam enviando os mesmos valores e preservam os erros existentes.
8. Testes relevantes e build passam; PR para hmg atualizada, sem conflitos e com CI aprovado.

## Sequência de implementação e verificação
1. Consultar grafo, ler implementações e testes; trabalhar em worktree isolado para preservar alterações locais.
2. Escrever cenários Gherkin pt-BR para alternância, teclado, envio, campos independentes, limites e privacidade; adicionar regressões em Configurações e criação de usuário. Executar e confirmar Red.
3. Implementar componente mínimo e substituir apenas campos sem toggle. Associar labels de Configurações a ids explícitos.
4. Executar testes novos e suítes dos formulários afetados (Green); revisar simplicidade, responsabilidades e diff.
5. Executar suíte web e build; validar no navegador o checkout correto com dados simulados quando necessário.
6. Revisar impacto pelo grafo, publicar branch e PR com este título para hmg. Acompanhar CI, corrigir falhas, atualizar com hmg e confirmar ausência de conflitos.
