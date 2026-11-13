# Chatbot no EasyPanel — homologação e produção

Issue #422. Este arquivo é checklist de implantação, não evidência de que serviços foram provisionados.

## Pré-requisitos e isolamento

- Validar o check `Chatbot / real DB, E2E and image` no SHA a implantar e registrar SHA/branch efetivamente usados pelo serviço.
- Homologação e produção devem ter configurações independentes; não trocar DB, segredos ou storage entre ambientes.
- Conferir nomes/projetos/endpoints diretamente no painel autenticado. Não confiar em nomes ou IPs antigos em docs históricas.
- Exportar/salvar configuração anterior de serviços existentes em armazenamento privado antes de alterar; não gravar envs neste repositório, logs ou issue.

## Serviço chatbot

- Tipo App, Dockerfile com contexto de build `apps/chat` e `Dockerfile` dentro desse contexto.
- Processo da imagem: `uvicorn app:app --host 0.0.0.0 --port 8000`.
- Exposição somente à API pela rede interna; remover/evitar domínio automático público e publicação da porta no host. Confirmar configuração efetiva, não apenas presumir que ausência de domínio manual significa privado.
- Não anexar volume/source do checkout local para mascarar arquivos ausentes na imagem.

Variáveis do chatbot, preenchidas pelo operador/cofre em cada ambiente:

```dotenv
DATABASE_URL=<mesmo banco do ambiente da API>
CHAT_DELEGATION_SECRET=<segredo forte compartilhado somente com a API desse ambiente>
ADY_API_URL=http://<hostname-interno-da-api>:3000
OPENROUTER_API_KEY=<credencial aprovada para esse ambiente>
MODEL_CHATBOT=<modelo validado para o ambiente>
```

`ADY_API_URL` é a origem da API, SEM `/api` no final; o código acrescenta os caminhos `/api/...`. Não expor segredo de delegação ao frontend nem reutilizar JWT_SECRET como valor por conveniência. Observabilidade é opcional e deve usar destino/credencial aprovados.

## API correspondente

```dotenv
CHAT_SERVICE_URL=http://<hostname-interno-do-chatbot>:8000
CHAT_DELEGATION_SECRET=<o mesmo segredo do chatbot deste ambiente>
```

- Build da API usa raiz do monorepo e `apps/api/Dockerfile`, com FFmpeg/Poppler/util-linux necessários à mídia.
- Aplicar migrations da versão validada no banco do ambiente sob o processo de release autorizado, antes de aceitar solicitações do chatbot. Não usar o runner CI ou fixtures de teste em bancos de homologação/produção.
- Confirmar que a versão da API implantada contém rotas proxy, mídia, planos e delegação compatíveis; provisionar só o Python não habilita a feature em uma API antiga.
- Configuração de anexos pertence à API, não ao Python. Em NODE_ENV=production não há fallback para disco local.

## Storage privado obrigatório para anexos

A API precisa de bucket R2 dedicado e privado, com `CHAT_PRIVATE_R2_BUCKET`, `CHAT_PRIVATE_R2_ACCOUNT_ID`, `CHAT_PRIVATE_R2_ACCESS_KEY_ID`, `CHAT_PRIVATE_R2_SECRET_ACCESS_KEY`. Só definir `CHAT_PRIVATE_R2_PRIVACY_CONFIRMED=true` depois de verificar administrativamente que r2.dev e domínios públicos estão desabilitados. O bucket público do Estúdio não é alternativa.

Sem acesso/credenciais de um bucket privado aprovado, reportar anexos como bloqueados; não alegar validação de mídia completa.

## Sequência e verificação

1. Conferir configuração/fonte no painel; preencher envs por ambiente sem exibir valores em captura/log.
2. Homologação: implantar SHA aprovado, verificar status/logs, OpenAPI interno do chatbot e autorização (sem token deve retornar 401 nas rotas protegidas).
3. Verificar comunicação nos dois sentidos: API→chatbot e chatbot→API, com hostname e porta internos reais. OpenAPI 200 sozinho não prova conexão DB nem geração.
4. Executar jornada com usuário/tenant de teste autorizado em homologação; efeitos pagos/publicações externas exigem autorização separada.
5. Só então repetir configuração/implantação validada em produção conforme autorização de release e smoke não destrutivo. Registrar fonte, horários, saúde e pendências sem dados pessoais/segredos.

Salvar configuração no EasyPanel não equivale a fazer deploy; confirmar leitura da configuração salva e estado do deployment após aplicar. Se a versão ainda só estiver na branch de feature, não alterar as branches de API/web nem promover para produção por conta própria.

## Referências oficiais consultadas

- EasyPanel App Service: https://easypanel.io/docs/services/app
- EasyPanel Builders / contexto Dockerfile: https://easypanel.io/docs/builders
- Hermes Passwords & Logins (acesso seguro ao painel): https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-vault
