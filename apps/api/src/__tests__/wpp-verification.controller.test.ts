import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { WppVerificationController } from '../controllers/wpp-verification.controller.js';
import type { WppVerificationService } from '../services/wpp/wpp-verification.service.js';

function makeReqRes(overrides: Record<string, unknown> = {}) {
  const req = {
    body: {},
    tenant: { tenantId: 'tenant-foo' },
    ...overrides,
  } as unknown as Request;
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return { req, res };
}

describe('WppVerificationController', () => {
  const next: NextFunction = vi.fn() as unknown as NextFunction;
  const validResult = { id: 'ver-1', phone: '5511999999999', expiresAt: new Date() };

  it('start happy: 201 com id/phone/expiresAt', async () => {
    const service = { start: vi.fn().mockResolvedValue(validResult) } as unknown as WppVerificationService;
    const ctrl = new WppVerificationController(service);
    const { req, res } = makeReqRes({ body: { phone: '(11) 99999-9999' } });

    await ctrl.start(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: validResult }));
    // zod tira a formatação; o service recebe só dígitos
    expect(service.start).toHaveBeenCalledWith('tenant-foo', '11999999999');
  });

  it('start sem telefone → 400 (zod)', async () => {
    const service = { start: vi.fn() } as unknown as WppVerificationService;
    const ctrl = new WppVerificationController(service);
    const { req, res } = makeReqRes({ body: {} });

    await ctrl.start(req, res, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as any;
    expect(err).toBeDefined(); // ZodError → 400 no errorHandler
    expect(service.start).not.toHaveBeenCalled();
  });

  it('start sem tenant (sem auth) → 401', async () => {
    const service = { start: vi.fn() } as unknown as WppVerificationService;
    const ctrl = new WppVerificationController(service);
    const { req, res } = makeReqRes({ body: { phone: '11999999999' }, tenant: undefined });

    await ctrl.start(req, res, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as any;
    expect(err.statusCode).toBe(401);
  });

  it('confirm happy: 200 com verified', async () => {
    const service = {
      confirm: vi.fn().mockResolvedValue({ verified: true, status: 'verified' }),
    } as unknown as WppVerificationService;
    const ctrl = new WppVerificationController(service);
    const { req, res } = makeReqRes({
      body: { verificationId: '11111111-1111-4111-8111-111111111111', code: '123456' },
    });

    await ctrl.confirm(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { verified: true, status: 'verified' } }));
    expect(service.confirm).toHaveBeenCalledWith('tenant-foo', '11111111-1111-4111-8111-111111111111', '123456');
  });

  it('confirm com código de 5 dígitos → 400 (zod)', async () => {
    const service = { confirm: vi.fn() } as unknown as WppVerificationService;
    const ctrl = new WppVerificationController(service);
    const { req, res } = makeReqRes({ body: { verificationId: 'ver-1', code: '12345' } });

    await ctrl.confirm(req, res, next);
    expect(service.confirm).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('confirm sem tenant → 401', async () => {
    const service = { confirm: vi.fn() } as unknown as WppVerificationService;
    const ctrl = new WppVerificationController(service);
    const { req, res } = makeReqRes({ body: { verificationId: 'ver-1', code: '123456' }, tenant: undefined });

    await ctrl.confirm(req, res, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as any;
    expect(err.statusCode).toBe(401);
  });

  it('status happy: 200 com dados (ou null)', async () => {
    const service = {
      status: vi.fn().mockResolvedValue({ id: 'ver-1', phone: '5511999999999', status: 'verified', verifiedAt: new Date(), expiresAt: new Date() }),
    } as unknown as WppVerificationService;
    const ctrl = new WppVerificationController(service);
    const { req, res } = makeReqRes();

    await ctrl.status(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(service.status).toHaveBeenCalledWith('tenant-foo');
  });

  it('status sem tenant → 401', async () => {
    const service = { status: vi.fn() } as unknown as WppVerificationService;
    const ctrl = new WppVerificationController(service);
    const { req, res } = makeReqRes({ tenant: undefined });

    await ctrl.status(req, res, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as any;
    expect(err.statusCode).toBe(401);
  });
});
