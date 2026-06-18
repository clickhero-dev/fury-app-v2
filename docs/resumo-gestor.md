# Fury App V2 — Situação Atual das Credenciais

O Fury App V2 usa **33 chaves e senhas** (banco de dados, Redis, APIs da Meta, OpenAI, Anthropic, DeepSeek, Asaas, Cloudflare R2, JWT) para funcionar.

**O problema:** essas credenciais estão espalhadas por 32 arquivos diferentes, cada uma carregada de um jeito. Não há um ponto único que valide se tudo que precisa está presente antes do sistema subir.

### Riscos concretos

**1. Senhas no código-fonte** — se `DATABASE_URL` não estiver configurada, o sistema usa uma senha padrão que está escrita no código (`postgresql://fury:***@localhost:5432/fury_dev`). Qualquer pessoa com acesso ao repositório vê essa senha.

**2. Falha silenciosa** — se a chave da OpenAI, Anthropic ou DeepSeek estiver vencida ou faltando, o sistema não alerta. O estúdio criativo simplesmente quebra sem erro visível.

**3. Duas criptografias diferentes para tokens Meta** — uma usa `TOKEN_ENCRYPTION_KEY`, outra deriva a chave do `JWT_SECRET`. Se o `JWT_SECRET` for trocado (boas práticas de segurança), todos os tokens Meta salvos no banco viram pó.

**4. Sem backup automatizado** — não há rotina de backup do banco. Um acidente no servidor ou banco = perda de dados.

**5. Sem acesso ao Railway** — a API está hospedada no Railway, mas não tenho acesso à plataforma. Para alterar qualquer credencial (uma chave de API que venceu, por exemplo), preciso solicitar a terceiros. O que deveria levar 5 minutos vira um processo de dias.

**6. Sem acesso ao Vercel** — o frontend está no Vercel, também sem acesso. Mesmo problema: qualquer configuração de ambiente depende de outra pessoa.

### Consequência

Hoje, **alterar uma senha ou chave de API** significa:
1. Solicitar acesso ou pedir para alguém fazer
2. Aguardar disponibilidade
3. Sem garantia de que foi atualizado corretamente

Isso trava modificações simples, atrasa ajustes de segurança e torna o sistema refém de terceiros para tarefas básicas de manutenção.

### O que muda com a VPS

| Recurso | Onde fica |
|---------|-----------|
| 🖥️ **API (backend)** | VPS |
| 🌐 **Frontend (web)** | VPS |
| ⚡ **Redis** | VPS |
| 🗄️ **Banco de dados (Neon)** | **Continua no Neon** (não mexe) |

O banco permanece no Neon — só a aplicação e o Redis migram para a VPS. Isso nos dá **acesso total** ao ambiente da aplicação sem precisar alterar a infraestrutura do banco.

**Prazo estimado:** 4 dias.
