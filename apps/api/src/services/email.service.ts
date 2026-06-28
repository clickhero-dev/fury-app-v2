import nodemailer from 'nodemailer';
import {
  otpEmailTemplate,
  passwordResetRequestEmailTemplate,
  passwordResetSuccessEmailTemplate,
  welcomeEmailTemplate,
} from './email-templates.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

function getFromAddress(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@fury.app';
}

export async function sendEmail(options: { to: string; subject: string; html: string }): Promise<void> {
  if (process.env.NODE_ENV === 'test' || process.env.EMAIL_ENABLED === 'false') {
    return;
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[email] SMTP não configurado — email não enviado:', options.subject, '→', options.to);
    return;
  }

  await getTransporter().sendMail({
    from: getFromAddress(),
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Bem-vindo ao FURY',
    html: welcomeEmailTemplate(name),
  });
}

export async function sendOtpEmail(to: string, name: string, otp: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Seu código de verificação — FURY',
    html: otpEmailTemplate(name, otp),
  });
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Redefinição de senha — FURY',
    html: passwordResetRequestEmailTemplate(name, resetUrl),
  });
}

export async function sendPasswordResetSuccessEmail(to: string, name: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Senha redefinida com sucesso — FURY',
    html: passwordResetSuccessEmailTemplate(name),
  });
}
