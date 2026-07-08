import * as nodemailer from 'nodemailer';

type EmailTransporter = ReturnType<typeof nodemailer.createTransport>;

let transporter: EmailTransporter | null = null;

function getTransporter(): EmailTransporter {
  if (transporter) {
    return transporter;
  }

  // Configurações oficiais do SMTP do Resend
  const smtpHost = 'smtp.resend.com';
  const smtpPort = 465; 
  const smtpUser = 'resend'; // O usuário para o SMTP do Resend é sempre fixo como 'resend'
  const smtpPass = process.env.RESEND_API_KEY || ''; // Utiliza a chave enviada pelo sênior

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: true, // true para a porta segura 465
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  return transporter;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(options: SendEmailOptions): Promise<void> {
  const transport = getTransporter();
  
  // O Resend em contas gratuitas exige o uso deste remetente padrão para testes
  const from = 'onboarding@resend.dev';

  try {
    await transport.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to send email to ${options.to}:`, errorMessage);
    throw error;
  }
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Código de Verificação</h2>
      <p style="color: #666; font-size: 16px;">Seu código OTP é:</p>
      <div style="background-color: #f0f0f0; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; color: #2196F3; letter-spacing: 8px;">${otp}</span>
      </div>
      <p style="color: #999; font-size: 14px;">Este código expira em 10 minutos. Não compartilhe este código com ninguém.</p>
    </div>
  `;

  await sendEmail({
    to,
    subject: 'Seu código de verificação FURY',
    html,
  });
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Bem-vindo ao FURY, ${name}!</h2>
      <p style="color: #666; font-size: 16px;">Sua conta foi criada com sucesso.</p>
      <p style="color: #666; font-size: 16px;">
        Você está pronto para começar a gerenciar suas campanhas de publicidade e potencializar seus resultados com FURY.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.APP_URL}" style="background-color: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Acessar Dashboard
        </a>
      </div>
      <p style="color: #999; font-size: 14px;">Se você tiver dúvidas, entre em contato conosco.</p>
    </div>
  `;

  await sendEmail({
    to,
    subject: 'Bem-vindo ao FURY!',
    html,
  });
}

export async function sendPasswordResetConfirmation(to: string): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Sua Senha Foi Redefinida</h2>
      <p style="color: #666; font-size: 16px;">Sua senha foi alterada com sucesso.</p>
      <p style="color: #666; font-size: 16px;">
        Se você não realizou esta mudança, altere sua senha imediatamente acessando sua conta.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.APP_URL}/login" style="background-color: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Fazer Login
        </a>
      </div>
      <p style="color: #999; font-size: 14px;">Se você tiver dúvidas, entre em contato conosco.</p>
    </div>
  `;

  await sendEmail({
    to,
    subject: 'Sua senha foi redefinida - FURY',
    html,
  });
}