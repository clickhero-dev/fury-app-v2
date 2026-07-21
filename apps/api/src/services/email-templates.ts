
/**
 * Email templates for FURY application.
 * All templates use table-based layouts with inline styles for maximum email client compatibility.
 */

const BRAND_COLOR = '#E8601C'; // FURY app orange — matched from the live login screen
const FONT = "'Segoe UI', Arial, Helvetica, sans-serif";
const TEXT_PRIMARY = '#3c3c3c';
const TEXT_SECONDARY = '#888888';
const FOOTER_TITLE_COLOR = '#222222';
const FOOTER_TEXT_COLOR = '#aaaaaa';
const SHELL_BG = '#eceff3';
const BODY_BORDER = '#d6dae1';
const FOOTER_BG = '#f7f8fa';
const FOOTER_BORDER = '#e0e3e8';
const OTP_BG = '#fdf8f4';

function getBaseTemplate(content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Click Hero</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: ${FONT}; background-color: ${SHELL_BG};">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${SHELL_BG};">
        <tr>
          <td style="padding: 48px 20px;">
            <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; border-collapse: collapse; background-color: white; border: 1px solid ${BODY_BORDER};">
              <!-- Header -->
              <tr style="background-color: ${BRAND_COLOR};">
                <td style="padding: 26px 40px; text-align: center;">
                  <span style="color: #ffffff; font-size: 21px; font-weight: 700; font-family: ${FONT}; letter-spacing: 0.05em;">Click Hero</span>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 38px 40px 40px 40px;">
                  ${content}
                </td>
              </tr>

              <!-- Footer -->
              <tr style="border-top: 1px solid ${FOOTER_BORDER}; background-color: ${FOOTER_BG};">
                <td style="padding: 22px 40px; text-align: center;">
                  <p style="margin: 0 0 5px 0; font-size: 13px; font-weight: 700; color: ${FOOTER_TITLE_COLOR}; font-family: ${FONT};">
                    Equipe Click Hero
                  </p>
                  <p style="margin: 0; font-size: 12px; color: ${FOOTER_TEXT_COLOR}; font-family: ${FONT};">
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

function ctaButton(url: string, label: string): string {
  return `
    <table role="presentation" style="border-collapse: collapse; margin: 32px auto 30px auto;">
      <tr>
        <td style="background-color: ${BRAND_COLOR}; padding: 3px; border-radius: 8px;">
          <table role="presentation" style="border-collapse: collapse;">
            <tr>
              <td style="background-color: ${BRAND_COLOR}; border: 2px solid rgba(255,255,255,0.3); border-radius: 6px;">
                <a href="${url}" style="display: inline-block; color: #ffffff; font-size: 13px; font-weight: 700; font-family: ${FONT}; text-transform: uppercase; letter-spacing: 0.12em; padding: 14px 48px; text-decoration: none;">
                  ${label}
                </a>
              </td>
            </tr>
          </table>
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
        `<span style="display: inline-block; font-size: 38px; font-weight: 700; color: ${BRAND_COLOR}; font-family: ${FONT}; margin: 0 10px;">${d}</span>`
    )
    .join('');

  const content = `
    <p style="margin: 0 0 22px 0; font-size: 13px; font-weight: 500; font-family: ${FONT}; color: ${BRAND_COLOR}; text-transform: uppercase; letter-spacing: 0.2em; line-height: 1.4; text-align: center;">
      Código de Verificação
    </p>

    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.75; color: ${TEXT_PRIMARY}; font-family: ${FONT}; text-align: left;">
      Seu código OTP para verificação de conta é:
    </p>

    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 28px 0;">
      <tr>
        <td style="border: 2px solid ${BRAND_COLOR}; border-radius: 4px; background-color: ${OTP_BG}; padding: 28px 16px; text-align: center;">
          ${digitsHtml}
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.75; color: ${TEXT_PRIMARY}; font-family: ${FONT}; text-align: left;">
      <strong style="font-weight: 700; color: #1a1a1a;">Importante:</strong> Este código expira em 10 minutos.
    </p>

    <p style="margin: 0; font-size: 13px; line-height: 1.75; color: ${TEXT_SECONDARY}; font-family: ${FONT}; text-align: left;">
      Nunca compartilhe este código com ninguém. A equipe Click Hero nunca pedirá seu código OTP por email ou telefone.
    </p>
  `;

  return getBaseTemplate(content);
}

export function welcomeEmailTemplate(name: string): string {
  const appUrl = process.env.APP_URL || 'https://app.clickhero.com';

  const content = `
    <p style="margin: 0 0 22px 0; font-size: 13px; font-weight: 500; font-family: ${FONT}; color: ${BRAND_COLOR}; text-transform: uppercase; letter-spacing: 0.2em; line-height: 1.4; text-align: center;">
      Bem-vindo ao FURY, ${name}!
    </p>

    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.75; color: ${TEXT_PRIMARY}; font-family: ${FONT}; text-align: left;">
      Sua conta foi criada com sucesso. Você está pronto para começar a gerenciar suas campanhas de publicidade e potencializar seus resultados com FURY.
    </p>

    ${ctaButton(appUrl, 'Acessar Dashboard')}

    <p style="margin: 0; font-size: 13px; line-height: 1.75; color: ${TEXT_SECONDARY}; font-family: ${FONT}; text-align: center;">
      Se tiver dúvidas ou precisar de suporte, nossa equipe está aqui para ajudar.
    </p>
  `;

  return getBaseTemplate(content);
}

export function passwordResetConfirmationTemplate(): string {
  const loginUrl = process.env.APP_URL ? `${process.env.APP_URL}/login` : 'https://app.clickhero.com/login';

  const content = `
    <p style="margin: 0 0 22px 0; font-size: 13px; font-weight: 500; font-family: ${FONT}; color: ${BRAND_COLOR}; text-transform: uppercase; letter-spacing: 0.2em; line-height: 1.4; text-align: center;">
      Sua Senha Foi Redefinida
    </p>

    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.75; color: ${TEXT_PRIMARY}; font-family: ${FONT}; text-align: center;">
      Sua senha foi alterada com sucesso.
    </p>

    ${ctaButton(loginUrl, 'Fazer Login')}

    <p style="margin: 0; font-size: 13px; line-height: 1.75; color: ${TEXT_SECONDARY}; font-family: ${FONT}; text-align: center;">
      Se você não realizou esta alteração de senha e sente que sua conta pode ter sido comprometida, entre em contato conosco imediatamente.
    </p>
  `;

  return getBaseTemplate(content);
}