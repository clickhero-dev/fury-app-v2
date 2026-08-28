/**
 * Email templates do Ady.
 * Layout baseado em tabelas com estilos inline para máxima compatibilidade
 * com clientes de email. Identidade ADY: tema escuro, Petroleum (#1E88A8),
 * CTA em Faísca (#CF6F03), fonte Gantari e logo Ady (SVG inline).
 */

const BRAND = '#1E88A8'; // Petróleo — primário
const BRAND_DARK = '#17708A'; // brand hover
const ACCENT = '#CF6F03'; // Faísca — CTA
const ACCENT_HOVER = '#E07B0B';
const BG = '#0C0D0A'; // fundo da página
const SURFACE = '#141512'; // cards/surfaces
const SURFACE_2 = '#1C1D1A'; // camada secundária
const TEXT = '#ECEDEF'; // texto principal
const TEXT_MUTED = '#A3A8B3'; // texto secundário
const TEXT_FAINT = '#8E939D'; // texto terciário
const BORDER = '#1F211D';
const FONT = "'Gantari', 'Segoe UI', Arial, Helvetica, sans-serif";

function logoAdy(): string {
  return `
    <table role="presentation" style="border-collapse: collapse; margin: 0 auto;">
      <tr>
        <td style="padding-right: 12px; vertical-align: middle;">
          <svg width="44" height="44" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g stroke="${BRAND}" stroke-width="4.2" stroke-linecap="round">
              <path d="M6.6 28 15.9 10.4"/>
              <path d="M25.4 28 16.1 10.4"/>
              <path d="M11.4 21.6h9.2" stroke-width="3.3"/>
            </g>
            <circle cx="16" cy="3.9" r="2" fill="${ACCENT}"/>
          </svg>
        </td>
        <td style="vertical-align: middle;">
          <span style="color: ${TEXT}; font-family: ${FONT}; font-size: 26px; font-weight: 700; letter-spacing: 0.02em;">ady</span>
        </td>
      </tr>
    </table>
  `;
}

function getBaseTemplate(content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ady</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: ${FONT}; background-color: ${BG};">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BG};">
        <tr>
          <td style="padding: 48px 20px;">
            <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; border-collapse: collapse; background-color: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 16px;">
              <!-- Header -->
              <tr>
                <td style="padding: 30px 40px 8px 40px; text-align: center;">
                  ${logoAdy()}
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 24px 40px 40px 40px;">
                  ${content}
                </td>
              </tr>

              <!-- Footer -->
              <tr style="border-top: 1px solid ${BORDER}; background-color: ${SURFACE_2};">
                <td style="padding: 22px 40px; text-align: center; border-radius: 0 0 16px 16px;">
                  <p style="margin: 0 0 5px 0; font-size: 13px; font-weight: 700; color: ${TEXT}; font-family: ${FONT};">
                    Equipe Ady
                  </p>
                  <p style="margin: 0; font-size: 12px; color: ${TEXT_FAINT}; font-family: ${FONT};">
                    Este é um email automático. Não responda diretamente a este email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function eyebrow(text: string): string {
  return `
    <p style="margin: 0 0 18px 0; font-size: 12px; font-weight: 600; font-family: ${FONT}; color: ${ACCENT}; text-transform: uppercase; letter-spacing: 0.22em; line-height: 1.4; text-align: center;">
      ${text}
    </p>
  `;
}

function heading(text: string): string {
  return `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; line-height: 1.4; font-weight: 700; font-family: ${FONT}; color: ${TEXT}; text-align: center;">
      ${text}
    </h2>
  `;
}

function statusBadge(label: string, color: string): string {
  return `
    <table role="presentation" style="border-collapse: collapse; margin: 0 auto 24px auto;">
      <tr>
        <td style="background-color: ${color}22; color: ${color}; border: 1px solid ${color}55; border-radius: 999px; padding: 6px 16px; font-size: 11px; font-weight: 700; font-family: ${FONT}; text-transform: uppercase; letter-spacing: 0.14em; text-align: center; white-space: nowrap;">
          ${label}
        </td>
      </tr>
    </table>
  `;
}

function checkList(items: string[]): string {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding: 5px 0; font-size: 13px; line-height: 1.6; color: ${TEXT_MUTED}; font-family: ${FONT};">
            ${item}
          </td>
        </tr>
      `
    )
    .join('');
  return `<table role="presentation" style="border-collapse: collapse; margin: 0 0 20px 0; width: 100%;">${rows}</table>`;
}

function bodyText(text: string, align: 'left' | 'center' = 'left'): string {
  return `
    <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.75; color: ${TEXT_MUTED}; font-family: ${FONT}; text-align: ${align};">
      ${text}
    </p>
  `;
}

function ctaButton(url: string, label: string): string {
  return `
    <table role="presentation" style="border-collapse: collapse; margin: 30px auto 28px auto;">
      <tr>
        <td style="border-radius: 10px;">
          <a href="${url}" style="display: inline-block; background-color: ${ACCENT}; color: #ffffff; font-size: 13px; font-weight: 700; font-family: ${FONT}; text-transform: uppercase; letter-spacing: 0.12em; padding: 15px 46px; text-decoration: none; border-radius: 10px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `;
}

export function otpEmailTemplate(otp: string): string {
  const digitsHtml = otp
    .split('')
    .map(
      (d) =>
        `<span style="display: inline-block; font-size: 38px; font-weight: 700; color: ${BRAND}; font-family: ${FONT}; margin: 0 10px;">${d}</span>`
    )
    .join('');

  const content = `
    ${eyebrow('Código de Recuperação')}

    ${bodyText('Use o código abaixo para redefinir a sua senha.')}

    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 28px 0;">
      <tr>
        <td style="border: 2px solid ${BRAND}; border-radius: 12px; background-color: ${SURFACE_2}; padding: 26px 16px; text-align: center;">
          ${digitsHtml}
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.75; color: ${TEXT_MUTED}; font-family: ${FONT}; text-align: left;">
      <strong style="font-weight: 700; color: ${TEXT};">Importante:</strong> este código expira em 15 minutos.
    </p>

    ${bodyText('Nunca compartilhe este código com ninguém. A equipe Ady nunca pedirá seu código por email ou telefone.')}
  `;

  return getBaseTemplate(content);
}

export function welcomeEmailTemplate(name: string): string {
  const appUrl = process.env.APP_URL || 'https://app.clickhero.com';

  const content = `
    ${eyebrow('Bem-vindo ao Ady')}

    ${bodyText(`Olá, <strong style="color: ${TEXT};">${name}</strong>! Sua conta foi criada com sucesso. Você já pode começar a potencializar os resultados das suas campanhas de tráfego.`)}

    ${ctaButton(appUrl, 'Acessar o Dashboard')}

    ${bodyText('Se tiver dúvidas ou precisar de ajuda, a nossa equipe está aqui para você.')}
  `;

  return getBaseTemplate(content);
}

export function passwordResetConfirmationTemplate(): string {
  const loginUrl = process.env.APP_URL ? `${process.env.APP_URL}/login` : 'https://app.clickhero.com/login';

  const content = `
    ${eyebrow('Senha Redefinida')}

    ${bodyText('Sua senha foi alterada com sucesso.', 'center')}

    ${ctaButton(loginUrl, 'Fazer Login')}

    ${bodyText('Se você não realizou esta alteração e acha que sua conta pode estar em risco, entre em contato com a nossa equipe imediatamente.')}
  `;

  return getBaseTemplate(content);
}

export function accountConnectedEmailTemplate(platform: string): string {
  const integrationsUrl = `${process.env.APP_URL || 'https://app.clickhero.com'}/configuracoes/integracoes`;

  const content = `
    ${eyebrow('Nova Conexão')}
    ${heading(`Sua conta ${platform} está conectada`)}
    ${statusBadge('Conectada', BRAND)}
    ${bodyText(`O Ady agora tem acesso às suas <strong style="color: ${TEXT};">contas e páginas ${platform}</strong>. Você já pode planejar, publicar e acompanhar suas campanhas direto pela aplicação.`)}
    ${ctaButton(integrationsUrl, 'Ir para as integrações')}
    ${bodyText('Ficou com alguma dúvida? Nossa equipe está aqui para ajudar.')}
  `;

  return getBaseTemplate(content);
}

export function accountDisconnectedEmailTemplate(platform: string): string {
  const integrationsUrl = `${process.env.APP_URL || 'https://app.clickhero.com'}/configuracoes/integracoes`;

  const content = `
    ${eyebrow('Aviso')}
    ${heading(`Sua conta ${platform} foi desconectada`)}
    ${statusBadge('Desconectada', '#da3633')}
    ${bodyText(`Removemos o acesso do Ady à sua conta ${platform}. Se foi você, fique tranquilo — reconecte quando quiser. Se não foi você, recomendamos revisar a segurança da sua conta.`)}
    ${ctaButton(integrationsUrl, 'Reconectar conta ' + platform)}
    ${bodyText('Precisa de ajuda? Estamos por aqui.')}
  `;

  return getBaseTemplate(content);
}

export function gmbLinkedEmailTemplate(businessName: string): string {
  const dashboardUrl = `${process.env.APP_URL || 'https://app.clickhero.com'}/configuracoes/google`;

  const content = `
    ${eyebrow('Nova Conexão')}
    ${heading('Seu negócio agora aparece no Google')}
    ${statusBadge('Vinculado', BRAND)}
    ${bodyText(`Vinculamos o perfil <strong style="color: ${TEXT};">${businessName}</strong> do Google Meu Negócio. Agora o Ady acompanha a presença do seu negócio nas buscas e ajuda a mantê-la em dia.`)}
    ${ctaButton(dashboardUrl, 'Ver minha ficha')}
    ${bodyText('Dúvidas? Nossa equipe está à disposição.')}
  `;

  return getBaseTemplate(content);
}

export function gmbUnlinkedEmailTemplate(): string {
  const dashboardUrl = `${process.env.APP_URL || 'https://app.clickhero.com'}/configuracoes/google`;

  const content = `
    ${eyebrow('Aviso')}
    ${heading('Seu perfil do Google foi desvinculado')}
    ${statusBadge('Desvinculado', '#da3633')}
    ${bodyText('Removemos o vínculo com o Google Meu Negócio. Se foi você, reconecte quando quiser. Se não foi, recomendamos revisar a segurança da sua conta Google.')}
    ${ctaButton(dashboardUrl, 'Reconectar Google')}
    ${bodyText('Precisa de ajuda? Estamos por aqui.')}
  `;

  return getBaseTemplate(content);
}

export function campaignPublishedEmailTemplate(campaignName: string): string {
  const dashboardUrl = `${process.env.APP_URL || 'https://app.clickhero.com'}/dashboard`;

  const content = `
    ${eyebrow('Impulsionamento no Ar')}
    ${heading('Sua campanha está no ar!')}
    ${statusBadge('Publicada', '#2ea043')}
    ${checkList([
      `🚀 Campanha <strong style="color: ${TEXT};">${campaignName}</strong> criada`,
      '🎯 Público e orçamento configurados',
      '✅ Publicada no Gerenciador de Anúncios',
    ])}
    ${bodyText('Sua campanha foi publicada com sucesso. Acompanhe os resultados pelo painel e ajuste a estratégia quando quiser.')}
    ${ctaButton(dashboardUrl, 'Acompanhar no painel')}
    ${bodyText('Boa campanha! Nossa equipe segue por perto.')}
  `;

  return getBaseTemplate(content);
}

export function gmbProfileVerifiedEmailTemplate(businessName: string): string {
  const dashboardUrl = `${process.env.APP_URL || 'https://app.clickhero.com'}/configuracoes/google`;

  const content = `
    ${eyebrow('Boas Notícias')}
    ${heading(`Seu perfil ${businessName} foi verificado`)}
    ${statusBadge('Verificado', '#2ea043')}
    ${bodyText('Seu perfil do Google Meu Negócio foi verificado e já está visível para os seus clientes nas buscas.')}
    ${ctaButton(dashboardUrl, 'Ver minha ficha')}
    ${bodyText('Continue por aqui para manter sua ficha sempre em dia.')}
  `;

  return getBaseTemplate(content);
}