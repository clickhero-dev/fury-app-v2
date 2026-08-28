import * as nodemailer from 'nodemailer';
import { otpEmailTemplate, welcomeEmailTemplate, passwordResetConfirmationTemplate } from './email-templates.js';

type EmailTransporter = ReturnType<typeof nodemailer.createTransport>;

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

const DEFAULT_FROM = 'no-reply@clickhero.com.br';

/**
 * EmailService — camada de infraestrutura (envio de email via Resend SMTP).
 * Instanciado como singleton em `emailService`. DI: AuthService injeta seus
 * métodos no construtor.
 */
export class EmailService {
  private transporter: EmailTransporter | null = null;

  private getTransporter(): EmailTransporter {
    if (this.transporter) {
      return this.transporter;
    }

    // SMTP oficial do Resend (mesma RESEND_API_KEY usada na API HTTP).
    const smtpHost = 'smtp.resend.com';
    const smtpPass = process.env.RESEND_API_KEY || '';

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: smtpPass,
      },
    });

    return this.transporter;
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const transport = this.getTransporter();

    // Remetente em um domínio verificado no Resend (clickhero.com.br).
    // O remetente padrão 'onboarding@resend.dev' é de teste e só permite enviar
    // para o email do dono da conta — para qualquer outro destinatário é preciso
    // enviar de um endereço no domínio verificado.
    const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

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

  sendOtpEmail(to: string, otp: string): Promise<void> {
    return this.sendEmail({
      to,
      subject: 'Seu código de verificação Ady',
      html: otpEmailTemplate(otp),
    });
  }

  sendWelcomeEmail(to: string, name: string): Promise<void> {
    return this.sendEmail({
      to,
      subject: 'Bem-vindo ao Ady!',
      html: welcomeEmailTemplate(name),
    });
  }

  sendPasswordResetConfirmation(to: string): Promise<void> {
    return this.sendEmail({
      to,
      subject: 'Sua senha foi redefinida - Ady',
      html: passwordResetConfirmationTemplate(),
    });
  }
}

export const emailService = new EmailService();