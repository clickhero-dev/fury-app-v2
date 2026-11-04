import { createHash } from 'node:crypto';
import { AppError } from '../../middleware/errorHandler.js';
import type { NotificationRepository } from '../../repository/notification.repository.js';

export type NotificationInput = { tenantId: string; callerId: string; recipientUserId: string; type: 'general'; title: string; body: string; idempotencyKey?: string };
export type NotificationEvent = (tenantId: string, userId: string) => void;

function hash(input: NotificationInput) {
  return createHash('sha256').update(JSON.stringify({ type: input.type, title: input.title, body: input.body, recipientUserId: input.recipientUserId })).digest('hex');
}

export class NotificationService {
  constructor(private readonly repository: NotificationRepository, private readonly emit: NotificationEvent) {}

  async create(input: NotificationInput) {
    if (!await this.repository.findUserInTenant(input.recipientUserId, input.tenantId)) throw new AppError(404, 'RECIPIENT_NOT_FOUND', 'Destinatário não encontrado');
    const payloadHash = hash(input);
    if (input.idempotencyKey) {
      const previous = await this.repository.findByIdempotencyKey(input.tenantId, input.callerId, input.idempotencyKey);
      if (previous) {
        if (previous.payloadHash !== payloadHash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'A chave já foi usada com outro conteúdo');
        return { item: previous, created: false };
      }
    }
    let item;
    try {
      item = await this.repository.create({ tenantId: input.tenantId, recipientUserId: input.recipientUserId, createdByUserId: input.callerId, type: input.type, title: input.title, body: input.body, idempotencyKey: input.idempotencyKey, payloadHash });
    } catch (error) {
      // A concorrência entre retries pode vencer a checagem anterior; a constraint
      // única é a autoridade final da idempotência.
      if (input.idempotencyKey && (error as { code?: string })?.code === '23505') {
        const previous = await this.repository.findByIdempotencyKey(input.tenantId, input.callerId, input.idempotencyKey);
        if (previous?.payloadHash === payloadHash) return { item: previous, created: false };
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'A chave já foi usada com outro conteúdo');
      }
      throw error;
    }
    this.emit(input.tenantId, input.recipientUserId);
    return { item, created: true };
  }

  list(tenantId: string, userId: string, limit: number, cursor?: { createdAt: Date; id: string }) { return this.repository.list(tenantId, userId, limit, cursor); }
  unreadCount(tenantId: string, userId: string) { return this.repository.unreadCount(tenantId, userId); }
  markRead(tenantId: string, userId: string, id: string) { return this.repository.markRead(tenantId, userId, id); }
  markAllRead(tenantId: string, userId: string) { return this.repository.markAllRead(tenantId, userId); }
}
