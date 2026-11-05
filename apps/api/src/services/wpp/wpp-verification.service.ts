import crypto from 'node:crypto';
import { AppError } from '../../middleware/errorHandler.js';
import { UazapiClient, UazapiError } from '../../lib/uazapi-client.js';
import { normalizePhoneToMetaE164 } from '../../utils/phone-normalize.js';
import type { WppVerificationRepository } from '../../repository/wpp-verification.repository.js';

/**
 * Domínio **WhatsApp — verificação de número** (uazapi). ADR-0001.
 *
 * Fluxo: start (checa existência → gera código 6 dígitos → envia por WhatsApp)
 * → usuário responde o código (webhook) ou digita na tela → confirm.
 * Código é guardado apenas como hash sha256(code + tenantId); expira em
 * CODE_TTL_MINUTES; rate limit por número: RESEND_COOLDOWN_SECONDS e
 * MAX_SENDS_PER_HOUR por hora.
 */

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 3;
const MAX_ATTEMPTS = 5;

export interface StartVerificationResult {
  id: string;
  phone: string;
  expiresAt: Date;
}

export interface ConfirmVerificationResult {
  verified: boolean;
  status: string;
}

export interface VerificationStatus {
  id: string;
  phone: string;
  status: string;
  verifiedAt: Date | null;
  expiresAt: Date;
}

function generateCode(): string {
  // 6 dígitos, crypto-safe, sem zero à esquerda perdido (000000 é válido)
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashCode(code: string, tenantId: string): string {
  return crypto.createHash('sha256').update(code + tenantId).digest('hex');
}

function isValidWppPhone(phone: string): boolean {
  // Com DDI 55: 12 (55+DDD2+8) ou 13 (55+DDD2+9) dígitos
  return phone.startsWith('55') && (phone.length === 12 || phone.length === 13);
}

export class WppVerificationService {
  constructor(
    private readonly client: UazapiClient,
    private readonly repoFactory: (tenantId: string) => WppVerificationRepository,
  ) {}

  async start(tenantId: string, rawPhone: string): Promise<StartVerificationResult> {
    const phone = normalizePhoneToMetaE164(rawPhone);
    if (!isValidWppPhone(phone)) {
      throw new AppError(400, 'WPP_INVALID_PHONE', 'Informe um número válido com DDD (ex.: (11) 99999-9999).');
    }

    const repo = this.repoFactory(tenantId);

    // Rate limit por número — antes de qualquer chamada externa.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [sendsLastHour, sendsCooldown] = await Promise.all([
      repo.countSentSince(phone, hourAgo),
      repo.countSentSince(phone, new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000)),
    ]);
    if (sendsLastHour >= MAX_SENDS_PER_HOUR || sendsCooldown > 0) {
      throw new AppError(
        429,
        'WPP_RATE_LIMITED',
        'Muitos envios para este número. Aguarde um minuto antes de tentar novamente.',
      );
    }

    // O número precisa existir no WhatsApp.
    try {
      const exists = await this.client.checkNumber(phone);
      if (!exists) {
        throw new AppError(
          400,
          'WPP_NUMBER_NOT_FOUND',
          'Este número não possui conta no WhatsApp. Confira o número informado.',
        );
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof UazapiError) {
        throw new AppError(502, 'WPP_UAZAPI_ERROR', 'Não foi possível verificar o número agora. Tente novamente em instantes.');
      }
      throw e;
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
    const verification = await repo.createPending({ phone, codeHash: hashCode(code, tenantId), expiresAt });

    try {
      await this.client.sendText(
        phone,
        `Seu código de verificação Ady: *${code}*\n\nResponda esta mensagem com o código para confirmar seu número. Ele expira em ${CODE_TTL_MINUTES} minutos.`,
      );
    } catch (e) {
      await repo.markFailed(verification.id);
      if (e instanceof UazapiError) {
        throw new AppError(502, 'WPP_SEND_FAILED', 'Não foi possível enviar o código pelo WhatsApp. Tente novamente em instantes.');
      }
      throw e;
    }

    return { id: verification.id, phone, expiresAt };
  }

  async confirm(tenantId: string, verificationId: string, code: string): Promise<ConfirmVerificationResult> {
    const repo = this.repoFactory(tenantId);
    const verification = await repo.findById(verificationId);
    if (!verification) {
      throw new AppError(404, 'WPP_VERIFICATION_NOT_FOUND', 'Verificação não encontrada.');
    }
    if (verification.status === 'verified') {
      return { verified: true, status: verification.status };
    }
    if (verification.status !== 'pending') {
      throw new AppError(400, 'WPP_INVALID_STATE', `Esta verificação está ${verification.status}. Inicie uma nova.`);
    }
    if (verification.expiresAt.getTime() < Date.now()) {
      await repo.markExpired(verification.id);
      throw new AppError(400, 'WPP_CODE_EXPIRED', 'Código expirado. Solicite um novo.');
    }
    if (verification.attempts >= MAX_ATTEMPTS) {
      await repo.markFailed(verification.id);
      throw new AppError(429, 'WPP_TOO_MANY_ATTEMPTS', 'Muitas tentativas. Solicite um novo código.');
    }

    if (hashCode(code, tenantId) !== verification.codeHash) {
      await repo.incrementAttempts(verification.id);
      throw new AppError(400, 'WPP_CODE_MISMATCH', 'Código incorreto.');
    }

    await repo.markVerified(verification.id);
    return { verified: true, status: 'verified' };
  }

  async status(tenantId: string): Promise<VerificationStatus | null> {
    const repo = this.repoFactory(tenantId);
    const latest = await repo.findLatestByTenant();
    if (!latest) return null;
    return {
      id: latest.id,
      phone: latest.phone,
      status: latest.status,
      verifiedAt: latest.verifiedAt ?? null,
      expiresAt: latest.expiresAt,
    };
  }
}
