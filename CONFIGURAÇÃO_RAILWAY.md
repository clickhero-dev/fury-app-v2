# Documentação de Configuração - Railway (ClickHero)

Para garantir o funcionamento correto do sistema **ClickHero (fury-app-v2)** no ambiente do Railway, as seguintes variáveis de ambiente e configurações devem ser respeitadas.

## 1. Variáveis de Ambiente (Environment Variables)

As variáveis abaixo devem ser configuradas na aba **Variables** do serviço `@fury/api`:

| Variável | Descrição | Valor Sugerido |
| :--- | :--- | :--- |
| **META_USE_MOCK** | Ativa o modo de simulação (Mock) para geração de imagens e autenticação. | `true` |
| **NODE_ENV** | Define o ambiente. Para testes com tokens mock, deve ser `development`. | `development` |
| **OPENAI_API_KEY** | Chave da API OpenAI. Se vazia e META_USE_MOCK=true, usa imagens de teste. | *Opcional se Mock ativo* |
| **DATABASE_URL** | URL de conexão com o PostgreSQL. | *Automático via Railway* |
| **REDIS_URL** | URL de conexão com o Redis para as filas do BullMQ. | *Automático via Railway* |

## 2. Fluxo de Autenticação em Testes (Nuvem)

Como o sistema utiliza JWT, para testes rápidos no Railway sem um fluxo de login completo, pode-se utilizar o token Mock oficial aceito pelo middleware:

- **Token:** `eyJ1c2VySWQiOiJ1c2VyLTeyMyJ9`
- **Exemplo de Header:** `Authorization: Bearer eyJ1c2VySWQiOiJ1c2VyLTeyMyJ9`

## 3. Endpoints de Teste

Para validar a geração de imagem via `curl` ou Postman:

**URL:** `https://furyapi-production.up.railway.app/api/studio/generate-image`  
**Método:** `POST`

## 4. Notas sobre Estabilidade

Se a `OPENAI_API_KEY` atingir o limite de faturamento (Billing hard limit), o sistema retornará erro 500 nos logs do Worker. Nestes casos, a ativação da `META_USE_MOCK=true` permite que a sprint continue funcional utilizando o provedor de imagens estáticas (Picsum).
