import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { WppVerificationService } from '../services/wpp/wpp-verification.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { UazapiError } from '../lib/uazapi-client.js';
import type { UazapiClient } from '../lib/uazapi-client.js';
import type { WppVerificationRepository } from '../repository/wpp-verification.repository.js';

/** Testes unitários do WppVerificationService — client e repository mockados. */

const tenantId = 'c3d2e1f0-0000-4000-8000-00000000000c';

function hashOf(code: string): string {
  return crypto.createHash('sha256').update(code + tenantId).digest('hex');
}

function makeDeps(overrides: {
  client?: Partial<UazapiClient>;
  repo?: Partial<WppVerificationRepository>;
} = {}) {
  const client = {
    checkNumber: vi.fn().mockResolvedValue(true),
    sendText: vi.fn().mockResolvedValue(undefined),
    ...overrides.client,
  } as unknown as UazapiClient;
  const repo = {
    createPending: vi.fn().mockImplementation(async (d: any) => ({
      id: 'ver-1',
      tenantId,
      status: 'pending',
      attempts: 0,
      sentCount: 1,
      ...d,
    })),
    findLatestPendingByPhone: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(undefined),
    findLatestByTenant: vi.fn().mockResolvedValue(undefined),
    markVerified: vi.fn().mockImplementation(async () => ({ id: 'ver-1', status: 'verified' })),
    markFailed: vi.fn().mockResolvedValue(undefined),
    markExpired: vi.fn().mockResolvedValue(undefined),
    incrementAttempts: vi.fn().mockImplementation(async () => ({ id: 'ver-1', attempts: 1 })),
    countSentSince: vi.fn().mockResolvedValue(0),
    ...overrides.repo,
  } as unknown as WppVerificationRepository;
  const factory = vi.fn(() => repo);
  const service = new WppVerificationService(client, factory);
  return { service, client, repo, factory };
}

describe('WppVerificationService.start', () => {
  it('happy path: normaliza p/ DDI 55, verifica, cria pending e envia código', async () => {
    const { service, client, repo } = makeDeps();
    const result = await service.start(tenantId, '(11) 99999-9999');

    expect(result.phone).toBe('5511999999999');
    expect(result.id).toBe('ver-1');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
    expect(client.checkNumber).toHaveBeenCalledWith('5511999999999');
    expect(repo.createPending).toHaveBeenCalledTimes(1);
    const sentText = (client.sendText as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(sentText).toMatch(/\d{6}/);
    // código nunca vai em texto puro pro banco
    const created = (repo.createPending as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(created.phone).toBe('5511999999999');
  });

  it('número nacional de 10 dígitos também recebe DDI 55', async () => {
    const { service } = makeDeps();
    const result = await service.start(tenantId, '1133334444');
    expect(result.phone).toBe('551133334444');
  });

  it('número já com DDI 55 (12-13 dígitos) passa intacto', async () => {
    const { service, client } = makeDeps();
    await service.start(tenantId, '5511999999999');
    expect(client.checkNumber).toHaveBeenCalledWith('5511999999999');
  });

  it('telefone inválido (poucos dígitos) → 400 sem chamar a uazapi', async () => {
    const { service, client } = makeDeps();
    const err = await service.start(tenantId, '99999').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(client.checkNumber).not.toHaveBeenCalled();
  });

  it('rate limit: 3 envios na última hora → 429 antes de chamar a uazapi', async () => {
    const { service, client } = makeDeps({
      repo: { countSentSince: vi.fn().mockResolvedValue(3) },
    });
    const err = await service.start(tenantId, '11999999999').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(429);
    expect(client.checkNumber).not.toHaveBeenCalled();
  });

  it('rate limit: envio nos últimos 60s → 429 (resend cooldown)', async () => {
    const { service, client } = makeDeps({
      repo: {
        countSentSince: vi.fn().mockImplementation(async (_phone, since: Date) => {
          // cooldown window (últimos ~90s) → 1 envio; janela de 1h pura → 0
          return since.getTime() > Date.now() - 90_000 ? 1 : 0;
        }),
      },
    });
    const err = await service.start(tenantId, '11999999999').catch((e) => e);
    expect(err.statusCode).toBe(429);
    expect(client.checkNumber).not.toHaveBeenCalled();
  });

  it('número não existe no WhatsApp → 400 e nada é criado/enviado', async () => {
    const { service, client, repo } = makeDeps({
      client: { checkNumber: vi.fn().mockResolvedValue(false) },
    });
    const err = await service.start(tenantId, '11999999999').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(repo.createPending).not.toHaveBeenCalled();
    expect(client.sendText).not.toHaveBeenCalled();
  });

  it('uazapi fora do ar (UazapiError) → AppError 502 amigável', async () => {
    const { service } = makeDeps({
      client: {
        checkNumber: vi.fn().mockRejectedValue(new UazapiError(502, 'UAZAPI_NETWORK_ERROR', 'boom')),
      },
    });
    const err = await service.start(tenantId, '11999999999').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(502);
  });

  it('falha no envio da mensagem → markFailed e AppError 502', async () => {
    const { service, repo } = makeDeps({
      client: { sendText: vi.fn().mockRejectedValue(new UazapiError(400, 'UAZAPI_REQUEST_FAILED', 'x')) },
    });
    const err = await service.start(tenantId, '11999999999').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(502);
    expect(repo.markFailed).toHaveBeenCalledWith('ver-1');
  });
});

describe('WppVerificationService.confirm', () => {
  const pendingRow = (over: Record<string, unknown> = {}) => ({
    id: 'ver-1',
    tenantId,
    phone: '5511999999999',
    status: 'pending',
    codeHash: hashOf('123456'),
    attempts: 0,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    ...over,
  });

  it('código correto → markVerified e retorna verified: true', async () => {
    const { service, repo } = makeDeps({
      repo: { findById: vi.fn().mockResolvedValue(pendingRow()) },
    });
    const result = await service.confirm(tenantId, 'ver-1', '123456');
    expect(result.verified).toBe(true);
    expect(repo.markVerified).toHaveBeenCalledWith('ver-1');
  });

  it('código errado → incrementAttempts e AppError 400', async () => {
    const { service, repo } = makeDeps({
      repo: { findById: vi.fn().mockResolvedValue(pendingRow()) },
    });
    const err = await service.confirm(tenantId, 'ver-1', '000000').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(repo.incrementAttempts).toHaveBeenCalledWith('ver-1');
    expect(repo.markVerified).not.toHaveBeenCalled();
  });

  it('código expirado → markExpired e AppError 400 CODE_EXPIRED', async () => {
    const { service, repo } = makeDeps({
      repo: {
        findById: vi.fn().mockResolvedValue(pendingRow({ expiresAt: new Date(Date.now() - 1000) })),
      },
    });
    const err = await service.confirm(tenantId, 'ver-1', '123456').catch((e) => e);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('WPP_CODE_EXPIRED');
    expect(repo.markExpired).toHaveBeenCalledWith('ver-1');
  });

  it('5 tentativas esgotadas → markFailed e 429', async () => {
    const { service, repo } = makeDeps({
      repo: { findById: vi.fn().mockResolvedValue(pendingRow({ attempts: 5 })) },
    });
    const err = await service.confirm(tenantId, 'ver-1', '123456').catch((e) => e);
    expect(err.statusCode).toBe(429);
    expect(repo.markFailed).toHaveBeenCalledWith('ver-1');
  });

  it('verificação inexistente → 404', async () => {
    const { service } = makeDeps();
    const err = await service.confirm(tenantId, 'ver-x', '123456').catch((e) => e);
    expect(err.statusCode).toBe(404);
  });

  it('já verificada → idempotente (verified true, sem update)', async () => {
    const { service, repo } = makeDeps({
      repo: { findById: vi.fn().mockResolvedValue(pendingRow({ status: 'verified' })) },
    });
    const result = await service.confirm(tenantId, 'ver-1', '123456');
    expect(result.verified).toBe(true);
    expect(repo.markVerified).not.toHaveBeenCalled();
  });

  it('status failed → 400 estado inválido', async () => {
    const { service } = makeDeps({
      repo: { findById: vi.fn().mockResolvedValue(pendingRow({ status: 'failed' })) },
    });
    const err = await service.confirm(tenantId, 'ver-1', '123456').catch((e) => e);
    expect(err.statusCode).toBe(400);
  });
});

describe('WppVerificationService.status', () => {
  it('sem verificação → null', async () => {
    const { service } = makeDeps();
    await expect(service.status(tenantId)).resolves.toBeNull();
  });

  it('com verificação → phone/status/verifiedAt', async () => {
    const { service } = makeDeps({
      repo: {
        findLatestByTenant: vi.fn().mockResolvedValue({
          id: 'ver-1',
          phone: '5511999999999',
          status: 'verified',
          verifiedAt: new Date('2026-09-21T15:00:00Z'),
          expiresAt: new Date('2026-09-21T15:10:00Z'),
        }),
      },
    });
    const result = await service.status(tenantId);
    expect(result).toMatchObject({ phone: '5511999999999', status: 'verified' });
  });
});
