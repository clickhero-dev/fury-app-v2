import crypto from 'node:crypto';
import type { WppWebhookRepository } from '../../repository/wpp-webhook.repository.js';
import type { WppVerificationRepository } from '../../repository/wpp-verification.repository.js';

/**
 * Domínio **WhatsApp — ingest de webhooks uazapi**. ADR-0001.
 *
 * 1. Sempre registra o payload CRU na inbox (`wpp_webhook_events`) — auditoria
 *    e reconciliação. NUNCA logar o payload (contém token da instância).
 * 2. Para `messages` recebidas (não fromMe, não grupo), tenta auto-confirmação:
 *    extrai telefone do chatid, busca verificação pending (GLOBAL — o tenant
 *    vem na row) e compara o código (hash sha256(code + tenantId)).
 */

interface IngestResult {
  eventId: string;
  verified: boolean;
}

interface WebhookEnvelope {
  EventType?: string;
  instanceName?: string;
  owner?: string;
  message?: { chatid?: string; text?: string | null; fromMe?: boolean } | null;
  [key: string]: unknown;
}

interface PendingVerification {
  id: string;
  tenantId: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
}

/** Dígitos do texto → candidatos de código (janelas de 6 dígitos). */
export function extractCodeCandidates(text: string): string[] {
  const digits = (text ?? '').replace(/\D/g, '');
  if (digits.length < 6) return [];
  if (digits.length === 6) return [digits];
  const candidates = new Set<string>();
  for (let i = 0; i + 6 <= digits.length && candidates.size < 20; i++) {
    candidates.add(digits.slice(i, i + 6));
  }
  return [...candidates];
}

function hashCode(code: string, tenantId: string): string {
  return crypto.createHash('sha256').update(code + tenantId).digest('hex');
}

export class WppWebhookService {
  constructor(
    private readonly webhookRepo: WppWebhookRepository,
    private readonly verificationRepoFactory: (tenantId: string) => WppVerificationRepository,
  ) {}

  async ingest(payload: unknown): Promise<IngestResult> {
    const envelope = (typeof payload === 'object' && payload !== null ? payload : {}) as WebhookEnvelope;
    const raw = envelope as Record<string, unknown>;

    // 1. Registro cru na inbox — sempre, mesmo envelope estranho.
    const event = await this.webhookRepo.insertEvent({
      eventType: typeof raw.EventType === 'string' ? raw.EventType : null,
      instanceName: typeof raw.instanceName === 'string' ? raw.instanceName : null,
      owner: typeof raw.owner === 'string' ? raw.owner : null,
      payload,
    });

    // 2. Auto-confirmação (best-effort — falha não impede o 200 nem marca feito).
    let verified = false;
    try {
      verified = await this.tryAutoConfirm(envelope);
    } catch (e) {
      console.error('[wpp-webhook] auto-confirm falhou:', e instanceof Error ? e.message : e);
      return { eventId: event.id, verified };
    }

    await this.webhookRepo.markProcessed(event.id).catch(() => undefined);
    return { eventId: event.id, verified };
  }

  private async tryAutoConfirm(envelope: WebhookEnvelope): Promise<boolean> {
    if (envelope.EventType !== 'messages') return false;
    const message = envelope.message;
    if (!message || typeof message.chatid !== 'string') return false;
    if (message.fromMe === true) return false;
    if (!message.chatid.endsWith('@s.whatsapp.net')) return false; // ignora grupos/canais
    const text = typeof message.text === 'string' ? message.text : '';
    if (!text) return false;

    const phone = message.chatid.split('@')[0];
    // Lookup GLOBAL (sem tenant) — o tenantId vem na row do pending.
    const globalRepo = this.verificationRepoFactory('');
    const verification = await globalRepo.findLatestPendingByPhoneGlobal(phone);
    if (!verification) return false;

    const pending = verification as PendingVerification;
    const repo = this.verificationRepoFactory(pending.tenantId);

    if (pending.expiresAt.getTime() < Date.now()) {
      await repo.markExpired(pending.id);
      return false;
    }

    for (const candidate of extractCodeCandidates(text)) {
      if (hashCode(candidate, pending.tenantId) === pending.codeHash) {
        await repo.markVerified(pending.id);
        return true;
      }
    }

    await repo.incrementAttempts(pending.id);
    return false;
  }
}
