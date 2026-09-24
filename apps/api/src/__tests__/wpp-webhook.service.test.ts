import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { WppWebhookService } from '../services/wpp/wpp-webhook.service.js';
import type { WppWebhookRepository } from '../repository/wpp-webhook.repository.js';
import type { WppVerificationRepository } from '../repository/wpp-verification.repository.js';

/** Testes do WppWebhookService — ingest na inbox + auto-confirmação de código. */

const tenantId = 'c3d2e1f0-0000-4000-8000-00000000000c';

function makeDeps(overrides: { repo?: Partial<WppVerificationRepository> } = {}) {
  const webhookRepo = {
    insertEvent: vi.fn().mockImplementation(async (d: any) => ({ id: 'evt-1', status: 'received', ...d })),
    markProcessed: vi.fn().mockResolvedValue(undefined),
  } as unknown as WppWebhookRepository;
  const verificationRepo = {
    findLatestPendingByPhone: vi.fn().mockResolvedValue(undefined),
    findLatestPendingByPhoneGlobal: vi.fn().mockResolvedValue(undefined),
    incrementAttempts: vi.fn().mockResolvedValue({ id: 'ver-1', attempts: 1 }),
    markVerified: vi.fn().mockResolvedValue({ id: 'ver-1', status: 'verified' }),
    markExpired: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    ...overrides.repo,
  } as unknown as WppVerificationRepository;
  const verificationFactory = vi.fn(() => verificationRepo);
  const service = new WppWebhookService(webhookRepo, verificationFactory);
  return { service, webhookRepo, verificationRepo, verificationFactory };
}

const messagesEnvelope = (over: Record<string, unknown> = {}) => ({
  EventType: 'messages',
  owner: '5511000000000',
  token: 'inst-token',
  BaseUrl: 'https://free.uazapi.com',
  instanceName: 'teste-wpp',
  message: {
    id: 'm1',
    chatid: '5511999999999@s.whatsapp.net',
    fromMe: false,
    messageType: 'Conversation',
    text: '123456',
    ...over,
  },
});

describe('WppWebhookService.ingest — inbox', () => {
  it('insere evento com envelope extraído e payload cru', async () => {
    const { service, webhookRepo } = makeDeps();
    const envelope = messagesEnvelope();
    const result = await service.ingest(envelope);
    expect(result.eventId).toBe('evt-1');
    expect(webhookRepo.insertEvent).toHaveBeenCalledWith({
      eventType: 'messages',
      instanceName: 'teste-wpp',
      owner: '5511000000000',
      payload: envelope,
    });
  });

  it('envelope estranho (não-objeto) ainda registra com eventType null', async () => {
    const { service, webhookRepo } = makeDeps();
    await service.ingest('garbage' as unknown as Record<string, unknown>);
    expect(webhookRepo.insertEvent).toHaveBeenCalledWith({
      eventType: null,
      instanceName: null,
      owner: null,
      payload: 'garbage',
    });
  });

  it('sempre tenta auto-confirmação quando é evento de mensagem recebida', async () => {
    const { service, verificationRepo } = makeDeps();
    await service.ingest(messagesEnvelope());
    expect(verificationRepo.findLatestPendingByPhoneGlobal).toHaveBeenCalledWith('5511999999999');
  });

  it('não tenta auto-confirmação quando EventType != messages', async () => {
    const { service, verificationRepo } = makeDeps();
    await service.ingest({ EventType: 'connection', instanceName: 'x' });
    expect(verificationRepo.findLatestPendingByPhoneGlobal).not.toHaveBeenCalled();
  });

  it('não tenta auto-confirmação para mensagem sem texto', async () => {
    const { service, verificationRepo } = makeDeps();
    await service.ingest(messagesEnvelope({ text: null }));
    expect(verificationRepo.findLatestPendingByPhoneGlobal).not.toHaveBeenCalled();
  });

  it('não tenta auto-confirmação para chatid de grupo (@g.us)', async () => {
    const { service, verificationRepo } = makeDeps();
    await service.ingest(messagesEnvelope({ chatid: '120363@g.us', text: '123456' }));
    expect(verificationRepo.findLatestPendingByPhoneGlobal).not.toHaveBeenCalled();
  });

  it('fromMe=true (mensagem enviada pela conta) não tenta auto-confirmação', async () => {
    const { service, verificationRepo } = makeDeps();
    await service.ingest(messagesEnvelope({ fromMe: true }));
    expect(verificationRepo.findLatestPendingByPhoneGlobal).not.toHaveBeenCalled();
  });
});

describe('WppWebhookService.ingest — auto-confirmação', () => {
  it('código bate (só dígitos do texto) → markVerified + markProcessed', async () => {
    const { service, verificationRepo, webhookRepo } = makeDeps({
      repo: {
        findLatestPendingByPhoneGlobal: vi.fn().mockResolvedValue({
          id: 'ver-1',
          tenantId,
          status: 'pending',
          codeHash: crypto.createHash('sha256').update('123456' + tenantId).digest('hex'),
          attempts: 0,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        }),
      },
    });
    const result = await service.ingest(messagesEnvelope({ text: 'meu codigo é 123456' }));
    expect(result.verified).toBe(true);
    expect(verificationRepo.markVerified).toHaveBeenCalledWith('ver-1');
    expect(webhookRepo.markProcessed).toHaveBeenCalledWith('evt-1');
  });

  it('hash do código leva tenantId da verificação em conta', async () => {
    const { service, verificationRepo } = makeDeps({
      repo: {
        findLatestPendingByPhone: vi.fn().mockResolvedValue({
          id: 'ver-1',
          tenantId,
          status: 'pending',
          codeHash: crypto.createHash('sha256').update('123456outro-tenant').digest('hex'),
          attempts: 0,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        }),
      },
    });
    const result = await service.ingest(messagesEnvelope());
    expect(result.verified).toBe(false);
    expect(verificationRepo.markVerified).not.toHaveBeenCalled();
  });

  it('código errado → incrementAttempts, sem markVerified', async () => {
    const { service, verificationRepo } = makeDeps({
      repo: {
        findLatestPendingByPhoneGlobal: vi.fn().mockResolvedValue({
          id: 'ver-1',
          status: 'pending',
          codeHash: 'hash-que-nao-bate',
          attempts: 0,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        }),
      },
    });
    const result = await service.ingest(messagesEnvelope());
    expect(result.verified).toBe(false);
    expect(verificationRepo.incrementAttempts).toHaveBeenCalledWith('ver-1');
  });

  it('verificação expirada → markExpired', async () => {
    const { service, verificationRepo } = makeDeps({
      repo: {
        findLatestPendingByPhoneGlobal: vi.fn().mockResolvedValue({
          id: 'ver-1',
          status: 'pending',
          codeHash: 'x',
          attempts: 0,
          expiresAt: new Date(Date.now() - 1000),
        }),
      },
    });
    await service.ingest(messagesEnvelope());
    expect(verificationRepo.markExpired).toHaveBeenCalledWith('ver-1');
  });

  it('sem pending para o telefone → apenas registra, sem erro', async () => {
    const { service } = makeDeps();
    const result = await service.ingest(messagesEnvelope());
    expect(result.verified).toBe(false);
  });

  it('código com mais de 6 dígitos no texto → usa apenas 6 primeiros grupos', async () => {
    const { service, verificationRepo } = makeDeps({
      repo: {
        findLatestPendingByPhoneGlobal: vi.fn().mockResolvedValue({
          id: 'ver-1',
          tenantId,
          status: 'pending',
          codeHash: crypto.createHash('sha256').update('654321' + tenantId).digest('hex'),
          attempts: 0,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        }),
      },
    });
    const result = await service.ingest(messagesEnvelope({ text: '654321 abc' }));
    expect(result.verified).toBe(true);
  });
});
