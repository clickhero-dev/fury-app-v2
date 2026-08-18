import * as nodemailer from 'nodemailer';
import { otpEmailTemplate, welcomeEmailTemplate, passwordResetConfirmationTemplate } from './email-templates.js';

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

export async function sendEmail(options: SendEmailOptions): Promise<void> {
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
  const html = otpEmailTemplate(otp);

  await sendEmail({
    to,
    subject: 'Seu código de verificação FURY',
    html,
  });
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const html = welcomeEmailTemplate(name);

  await sendEmail({
    to,
    subject: 'Bem-vindo ao FURY!',
    html,
  });
}

export async function sendPasswordResetConfirmation(to: string): Promise<void> {
  const html = passwordResetConfirmationTemplate();

  await sendEmail({
    to,
    subject: 'Sua senha foi redefinida - FURY',
    html,
  });
}