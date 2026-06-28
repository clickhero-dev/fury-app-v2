const BRAND_COLOR = '#6366f1';
const TEXT_COLOR = '#1f2937';
const MUTED_COLOR = '#6b7280';

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:${BRAND_COLOR};padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:bold;">FURY</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:${TEXT_COLOR};font-size:16px;line-height:1.6;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background-color:#f9fafb;color:${MUTED_COLOR};font-size:12px;line-height:1.5;">
              Este é um email automático. Por favor, não responda.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function welcomeEmailTemplate(name: string): string {
  const greeting = name ? `Olá, ${name}!` : 'Olá!';
  return layout(
    'Bem-vindo ao FURY',
    `<p style="margin:0 0 16px;">${greeting}</p>
     <p style="margin:0 0 16px;">Sua conta foi criada com sucesso na plataforma FURY.</p>
     <p style="margin:0;">Em breve você receberá um código para verificar seu email e começar a usar a plataforma.</p>`
  );
}

export function otpEmailTemplate(name: string, otp: string): string {
  const greeting = name ? `Olá, ${name}!` : 'Olá!';
  return layout(
    'Código de verificação',
    `<p style="margin:0 0 16px;">${greeting}</p>
     <p style="margin:0 0 24px;">Use o código abaixo para verificar seu email. Ele expira em 10 minutos.</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
       <tr>
         <td style="background-color:#f3f4f6;border-radius:8px;padding:16px 32px;text-align:center;">
           <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:${BRAND_COLOR};">${otp}</span>
         </td>
       </tr>
     </table>
     <p style="margin:0;color:${MUTED_COLOR};font-size:14px;">Se você não solicitou este código, ignore este email.</p>`
  );
}

export function passwordResetRequestEmailTemplate(name: string, resetUrl: string): string {
  const greeting = name ? `Olá, ${name}!` : 'Olá!';
  return layout(
    'Redefinição de senha',
    `<p style="margin:0 0 16px;">${greeting}</p>
     <p style="margin:0 0 24px;">Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para continuar. O link expira em 1 hora.</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
       <tr>
         <td style="border-radius:6px;background-color:${BRAND_COLOR};">
           <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;">Redefinir senha</a>
         </td>
       </tr>
     </table>
     <p style="margin:0 0 8px;color:${MUTED_COLOR};font-size:14px;">Ou copie e cole este link no navegador:</p>
     <p style="margin:0;word-break:break-all;font-size:14px;color:${BRAND_COLOR};">${resetUrl}</p>
     <p style="margin:24px 0 0;color:${MUTED_COLOR};font-size:14px;">Se você não solicitou a redefinição, ignore este email.</p>`
  );
}

export function passwordResetSuccessEmailTemplate(name: string): string {
  const greeting = name ? `Olá, ${name}!` : 'Olá!';
  return layout(
    'Senha redefinida',
    `<p style="margin:0 0 16px;">${greeting}</p>
     <p style="margin:0 0 16px;">Sua senha foi redefinida com sucesso.</p>
     <p style="margin:0;color:${MUTED_COLOR};font-size:14px;">Se você não realizou esta alteração, entre em contato com o suporte imediatamente.</p>`
  );
}
