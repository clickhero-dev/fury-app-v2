/*
Funcionalidade: notificações in-app
Cenário: criar uma notificação autorizada e idempotente
Dado um admin e um destinatário do mesmo tenant
Quando a notificação é criada duas vezes com a mesma chave
Então o segundo resultado reutiliza o primeiro registro sem publicar outro evento
*/
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { NotificationService } from '../services/notifications/notification.service.js';

const base = { id: 'n1', tenantId: 't1', recipientUserId: 'u2', createdByUserId: 'u1', type: 'general', title: 'Aviso', body: 'Texto', readAt: null, createdAt: new Date() };

describe('NotificationService', () => {
  it('reuses an idempotent notification and emits only once', async () => {
    const payloadHash = createHash('sha256').update(JSON.stringify({ type: 'general', title: 'Aviso', body: 'Texto', recipientUserId: 'u2' })).digest('hex');
    const repository = {
      findUserInTenant: vi.fn().mockResolvedValue({ id: 'u2', tenantId: 't1' }),
      findByIdempotencyKey: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ ...base, payloadHash }),
      create: vi.fn().mockResolvedValue({ ...base, payloadHash }),
    };
    const emit = vi.fn();
    const service = new NotificationService(repository as any, emit);
    const input = { tenantId: 't1', callerId: 'u1', recipientUserId: 'u2', type: 'general' as const, title: 'Aviso', body: 'Texto', idempotencyKey: 'retry-1' };

    const first = await service.create(input);
    const second = await service.create(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('rejects an idempotency key reused with a different payload', async () => {
    const repository = {
      findUserInTenant: vi.fn().mockResolvedValue({ id: 'u2', tenantId: 't1' }),
      findByIdempotencyKey: vi.fn().mockResolvedValue({ ...base, payloadHash: 'other' }),
    };
    const service = new NotificationService(repository as any, vi.fn());

    await expect(service.create({ tenantId: 't1', callerId: 'u1', recipientUserId: 'u2', type: 'general', title: 'Novo', body: 'Texto', idempotencyKey: 'retry-1' })).rejects.toMatchObject({ statusCode: 409 });
  });
});
