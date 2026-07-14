/**
 * Email templates for FURY application.
 * All templates use table-based layouts with inline styles for maximum email client compatibility.
 */

const BRAND_COLOR = '#1e40af'; // Professional blue
const TEXT_PRIMARY = '#1f2937'; // Dark gray
const TEXT_SECONDARY = '#6b7280'; // Medium gray
const BG_LIGHT = '#f9fafb'; // Very light gray
const BORDER_COLOR = '#e5e7eb'; // Light border

function getBaseTemplate(content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Click Hero</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: ${BG_LIGHT};">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BG_LIGHT};">
        <tr>
          <td style="padding: 20px 0;">
            <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; border-collapse: collapse; background-color: white; border: 1px solid ${BORDER_COLOR};">
              <!-- Header -->
              <tr style="background-color: ${BRAND_COLOR};">
                <td style="padding: 30px 20px; text-align: center;">
                  <span style="color: white; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Click Hero</span>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 30px 20px; color: ${TEXT_PRIMARY}; font-size: 16px; line-height: 1.6;">
                  ${content}
                </td>
              </tr>

              <!-- Footer -->
              <tr style="border-top: 1px solid ${BORDER_COLOR}; background-color: ${BG_LIGHT};">
                <td style="padding: 20px; text-align: center; color: ${TEXT_SECONDARY}; font-size: 13px; line-height: 1.5;">
                  <p style="margin: 0 0 10px 0;">
                    <strong style="color: ${TEXT_PRIMARY};">Equipe Click Hero</strong>
                  </p>
                  <p style="margin: 0; font-style: italic;">
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

export function otpEmailTemplate(otp: string): string {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: ${BRAND_COLOR}; font-size: 24px; font-weight: bold;">
      Código de Verificação
    </h2>

    <p style="margin: 0 0 10px 0; color: ${TEXT_PRIMARY};">
      Seu código OTP para verificação de conta é:
    </p>

    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 25px 0;">
      <tr>
        <td style="padding: 20px; background-color: ${BG_LIGHT}; border: 2px solid ${BRAND_COLOR}; text-align: center;">
          <div style="font-size: 48px; font-weight: bold; color: ${BRAND_COLOR}; letter-spacing: 8px; word-spacing: 8px; font-family: 'Courier New', monospace;">
            ${otp.split('').join(' ')}
          </div>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 15px 0; color: ${TEXT_PRIMARY};">
      <strong>Importante:</strong> Este código expira em 10 minutos.
    </p>

    <p style="margin: 0; color: ${TEXT_SECONDARY}; font-size: 14px;">
      Nunca compartilhe este código com ninguém. A equipe Click Hero nunca pedirá seu código OTP por email ou telefone.
    </p>
  `;

  return getBaseTemplate(content);
}

export function welcomeEmailTemplate(name: string): string {
  const appUrl = process.env.APP_URL || 'https://app.clickhero.com';

  const content = `
    <h2 style="margin: 0 0 20px 0; color: ${BRAND_COLOR}; font-size: 24px; font-weight: bold;">
      Bem-vindo ao FURY, ${name}!
    </h2>

    <p style="margin: 0 0 15px 0; color: ${TEXT_PRIMARY};">
      Sua conta foi criada com sucesso. Você está pronto para começar a gerenciar suas campanhas de publicidade e potencializar seus resultados com FURY.
    </p>

    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
      <tr>
        <td style="padding: 0; text-align: center;">
          <a href="${appUrl}" style="display: inline-block; background-color: ${BRAND_COLOR}; color: white; padding: 14px 32px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Acessar Dashboard
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0; color: ${TEXT_SECONDARY}; font-size: 14px;">
      Se tiver dúvidas ou precisar de suporte, nossa equipe está aqui para ajudar.
    </p>
  `;

  return getBaseTemplate(content);
}

export function passwordResetConfirmationTemplate(): string {
  const loginUrl = process.env.APP_URL ? `${process.env.APP_URL}/login` : 'https://app.clickhero.com/login';

  const content = `
    <h2 style="margin: 0 0 20px 0; color: ${BRAND_COLOR}; font-size: 24px; font-weight: bold;">
      Sua Senha Foi Redefinida
    </h2>

    <p style="margin: 0 0 15px 0; color: ${TEXT_PRIMARY};">
      Sua senha foi alterada com sucesso. Se você não realizou esta mudança, altere sua senha imediatamente fazendo login em sua conta.
    </p>

    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
      <tr>
        <td style="padding: 0; text-align: center;">
          <a href="${loginUrl}" style="display: inline-block; background-color: ${BRAND_COLOR}; color: white; padding: 14px 32px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Fazer Login
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0; color: ${TEXT_SECONDARY}; font-size: 14px;">
      Se você não realizou esta alteração de senha e sente que sua conta pode ter sido comprometida, entre em contato conosco imediatamente.
    </p>
  `;

  return getBaseTemplate(content);
}
