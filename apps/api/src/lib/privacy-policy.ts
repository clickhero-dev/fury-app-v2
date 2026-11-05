/**
 * Política de Privacidade padrão do anunciante, servida em página pública
 * (GET /privacidade/:slug) e usada no campo `privacy_policy` da criação de
 * leadgen_forms (a Meta exige url + link_text).
 *
 * O placeholder {NOME_DO_TENANT} é substituído pelo nome da organização do
 * tenant em tempo de renderização.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPrivacyPolicyBody(tenantName: string): string {
  return `# Política de Privacidade — {NOME_DO_TENANT}

**Última atualização:** 22 de setembro de 2026

A {NOME_DO_TENANT} valoriza a sua privacidade e está comprometida com a proteção dos dados pessoais tratados neste site e nos formulários de captação (anúncios de leads), em conformidade com a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).

## 1. Dados coletados

Ao preencher o formulário em nossos anúncios, coletamos apenas os dados necessários para o atendimento:
- Nome;
- E-mail;
- Telefone.

Também podemos registrar dados de navegação (como páginas acessadas e origem do acesso) de forma anônima ou agregada, para melhorar nossos anúncios e serviços.

## 2. Finalidade do uso

Os dados informados são utilizados exclusivamente para:
- Responder à sua solicitação e entrar em contato pelo canal escolhido (telefone, WhatsApp ou e-mail);
- Enviar informações sobre produtos, serviços ou novidades, desde que você tenha consentido;
- Melhorar a relevância dos nossos anúncios e do atendimento.

## 3. Compartilhamento

A {NOME_DO_TENANT} **não vende** os seus dados pessoais. Eles são compartilhados apenas com:
- Plataformas de anúncios (ex.: Meta), conforme a política de cada plataforma, para entrega e medição das campanhas;
- Prestadores de serviços essenciais ao atendimento (ex.: ferramentas de CRM e mensageria), sempre com obrigação de confidencialidade.

## 4. Armazenamento e segurança

Os dados são armazenados em servidores seguros e mantidos somente pelo tempo necessário às finalidades descritas ou pelo prazo exigido por lei. Adotamos medidas técnicas e organizacionais para prevenir acessos não autorizados.

## 5. Seus direitos

Nos termos da LGPD, você pode, a qualquer momento, solicitar:
- Confirmação da existência de tratamento;
- Acesso, correção ou atualização dos seus dados;
- Anonimização, bloqueio ou eliminação de dados desnecessários;
- Revogação do consentimento;
- Portabilidade dos dados.

## 6. Contato

Para exercer seus direitos ou tirar dúvidas sobre esta política, fale conosco pelo WhatsApp ou pelos canais de atendimento da {NOME_DO_TENANT}.`.split('{NOME_DO_TENANT}').join(tenantName);
}

function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      closeList();
      out.push(`<h1>${h1[1]}</h1>`);
      continue;
    }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      closeList();
      out.push(`<h2>${h2[1]}</h2>`);
      continue;
    }
    const li = line.match(/^-\s+(.+)$/);
    if (li) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${li[1]}</li>`);
      continue;
    }
    closeList();
    // **negrito** → <strong>
    const html = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out.push(`<p>${html}</p>`);
  }
  closeList();

  return out.join('\n');
}

/** HTML completo da página pública de política de privacidade (estilo da LP). */
export function renderPrivacyPolicyHtml(tenantName: string): string {
  const name = escapeHtml(tenantName.trim() || 'Nossa empresa');
  const body = renderMarkdownToHtml(buildPrivacyPolicyBody(name));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Política de Privacidade — ${name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;color:#333;padding:24px;line-height:1.6}
.container{max-width:720px;margin:0 auto;background:#fff;border-radius:12px;padding:32px}
h1{font-size:22px;margin-bottom:16px;color:#111}
h2{font-size:17px;margin:20px 0 8px;color:#111}
p{margin-bottom:12px;font-size:15px}
ul{margin:0 0 12px 4px;padding-left:20px}
li{font-size:15px}
</style>
</head>
<body>
<div class="container">
${body}
</div>
</body>
</html>`;
}

/** URL pública da política de privacidade de um slug de tenant. */
export function privacyPolicyUrl(slug: string): string {
  return `https://app.useady.com.br/privacidade/${slug}`;
}