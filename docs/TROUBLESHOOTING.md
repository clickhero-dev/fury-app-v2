# Troubleshooting

## Problemas ao Rodar Localmente

### `npm install` falha com erros de dependência

```bash
# Limpa cache e reinstala
rm -rf node_modules
npm cache clean --force
npm install
```

Se o erro persistir, verifique se está usando Node.js 18+:
```bash
node --version
```

---

### API não sobe — erro de conexão com banco

**Sintoma:** `Error: connect ECONNREFUSED` ou `getaddrinfo ENOTFOUND`

**Causas comuns:**
- `DATABASE_URL` não preenchida ou com valor errado no `apps/api/.env`
- Branch do Neon pausado (plano free pausa após inatividade)

**Solução:**
1. Verifique se o `.env` existe em `apps/api/`
2. Acesse o painel do Neon e veja se o banco está ativo
3. Copie a Connection String novamente do Neon (pode ter expirado)

---

### Frontend não conecta na API — erro de CORS

**Sintoma:** Erro `CORS policy: No 'Access-Control-Allow-Origin'` no console do navegador

**Solução:** Verifique se a variável `CORS_ALLOWED_ORIGINS` no `apps/api/.env` inclui a URL do frontend:

```env
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

---

### Login falha com "Token inválido"

**Causas comuns:**
- `JWT_SECRET` diferente entre reinicializações (se estiver sendo gerado dinamicamente)
- Token expirado

**Solução:** Garanta que `JWT_SECRET` e `JWT_REFRESH_SECRET` são strings fixas no `.env`, não geradas em runtime.

---

### Meta API retorna erro mesmo com credenciais corretas

**Para desenvolvimento**, ative o modo mock e evite depender da API real:

```env
META_USE_MOCK=true
```

Se precisar usar a API real, verifique:
1. `META_APP_ID` e `META_APP_SECRET` estão corretos
2. O app Meta está em modo de desenvolvimento com seu usuário como tester
3. O token de acesso não expirou

---

### Imagens do Estúdio não aparecem após geração

**Causa:** Em desenvolvimento, as imagens são salvas em `STUDIO_ASSETS_DIR`. Se a pasta não existir, a geração falha silenciosamente.

**Solução:**
```bash
mkdir -p /tmp/studio-assets
```

Em produção, garanta que as variáveis `R2_*` estão preenchidas — sem R2, as imagens não persistem entre deploys no Railway.

---

### Migrations falham

**Sintoma:** `Error: relation "xxx" does not exist` ou erro de schema

**Solução:**
```bash
cd packages/db

# Verifica estado atual das migrations
npm run db:status

# Roda migrations pendentes
npm run db:migrate
```

Se o banco estiver muito desatualizado, pode ser necessário rodar as migrations em ordem. Nunca delete migrations já aplicadas.

---

### Redis indisponível

**Sintoma:** `Error: connect ECONNREFUSED` na URL do Redis

**Em desenvolvimento:** o Redis é opcional para funcionalidades básicas. Se não tiver Redis local, você pode comentar a `REDIS_URL` temporariamente — o cache será ignorado.

**Em produção:** verifique se o serviço Redis está ativo no Railway.

---

## Erros Comuns em Produção

### Deploy no Railway trava no build

1. Verifique os logs em Railway → seu serviço → *Deployments* → último deploy
2. Erros de TypeScript bloqueiam o build — corrija localmente e faça novo push

### Frontend em produção mostra dados antigos (cache)

A Vercel tem cache agressivo. Para forçar rebuild:
1. Acesse Vercel → seu projeto → *Deployments*
2. Clique no último deploy → *Redeploy*

### API em produção retorna 500 sem mensagem clara

1. Acesse Railway → seu serviço → *Logs*
2. Procure por `Error:` ou `Unhandled` nos logs em tempo real
3. Verifique se todas as variáveis de ambiente estão preenchidas (uma variável faltando causa 500 em cascata)

---

## Onde pedir ajuda

- **Logs da API:** Railway → Logs
- **Logs do Frontend:** Vercel → Functions logs
- **Banco:** Neon → Monitoring
- **Dúvidas no código:** abra uma issue no repositório ou pergunte no canal do time