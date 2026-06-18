**Assunto:** Fury App V2 — Situação atual e proposta de migração

**Para:** Ligo

---

Oi Ligo,

Estou escrevendo para apresentar um panorama do Fury App V2 e uma proposta de melhoria.

**O cenário atual**

O sistema de automação de anúncios depende de 33 senhas e chaves de serviço diferentes (banco de dados, inteligência artificial, anúncios da Meta, armazenamento de imagens). Essas senhas estão espalhadas pelo código, cada uma carregada de um jeito, e não há uma validação que garanta que tudo está certo antes do sistema ligar.

**Os problemas que identificamos**

1. **Senhas expostas no código** — senhas do banco de dados escritas diretamente no código-fonte. Se o repositório vazar, as senhas vazam junto.

2. **Falha silenciosa** — se uma chave de serviço externo (como a inteligência artificial que gera os criativos) vencer ou estiver faltando, o sistema simplesmente para de funcionar sem nenhum aviso. Só descobrimos quando um cliente reclama.

3. **Risco de perder dados** — os tokens de acesso à Meta são guardados com duas formas diferentes de criptografia. Se precisarmos trocar uma chave de segurança, os tokens podem se tornar irrecuperáveis — o que significa desconectar todos os clientes e obrigá-los a autorizar o acesso novamente.

4. **Zero backup** — não existe backup automático do banco de dados. Um erro no servidor pode destruir dados sem recuperação.

5. **Sem acesso direto ao ambiente** — a aplicação está hospedada no Railway e no Vercel, mas não temos acesso a essas plataformas. Para alterar qualquer senha ou configuração, precisamos solicitar a terceiros. O que leva 5 minutos vira um processo de dias.

**O que proponho**

Migrar a aplicação (API + site) e o Redis para uma VPS própria — um servidor nosso na nuvem. O banco de dados continua hospedado onde está (Neon), sem alteração.

**O que muda com isso:**

| | Hoje | Com VPS |
|---|---|---|
| Acesso ao sistema | Nenhum (depende de terceiros) | Total (acesso direto) |
| Alterar uma senha | Dias (solicitar, aguardar) | Minutos (fazemos direto) |
| Backup do banco | Inexistente | Automático diário |
| Risco de falha silenciosa | Alto | Baixo (validação na inicialização) |

**Trade-offs:**

- ✅ Ganhamos autonomia total sobre senhas e configurações
- ✅ Backup automático sem depender de ninguém
- ✅ Validação na inicialização (evita falha silenciosa)
- ❌ Precisamos configurar e manter o servidor
- ❌ Cust operacional do servidor (VPS)

**Próximos passos:**

1. Já fizemos o mapeamento completo de todas as 33 senhas
2. Precisamos centralizar as senhas em um arquivo protegido com validação
3. Contratar/configurar a VPS e migrar API + site + Redis
4. Ativar backup automático diário

**Prazo estimado: 3 dias.**

Fico à disposição para alinhar os próximos passos.

Atenciosamente,
Diogo
