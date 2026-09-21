import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { WppWebhookController } from '../controllers/wpp-webhook.controller.js';
import type { WppWebhookService } from '../services/wpp/wpp-webhook.service.js';

function makeReqRes(body: unknown) {
  const req = { body } as unknown as Request;
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return { req, res };
}

describe('WppWebhookController', () => {
  const next: NextFunction = vi.fn() as unknown as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: 200 {received:true} imediatamente', async () => {
    const service = { ingest: vi.fn().mockResolvedValue({ eventId: 'evt-1', verified: false }) } as unknown as WppWebhookService;
    const ctrl = new WppWebhookController(service);
    const { req, res } = makeReqRes({ EventType: 'connection' });

    await ctrl.handle(req, res, next);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('body não-objeto → next com AppError 400', async () => {
    const service = { ingest: vi.fn() } as unknown as WppWebhookService;
    const ctrl = new WppWebhookController(service);
    const { req, res } = makeReqRes('nao-sou-objeto');

    await ctrl.handle(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
    expect(err.statusCode).toBe(400);
    expect(service.ingest).not.toHaveBeenCalled();
  });

  it('body ausente (undefined) → 400', async () => {
    const service = { ingest: vi.fn() } as unknown as WppWebhookService;
    const ctrl = new WppWebhookController(service);
    const { req, res } = makeReqRes(undefined);

    await ctrl.handle(req, res, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as any;
    expect(err.statusCode).toBe(400);
  });

  it('array passa (pode ser lista de eventos)', async () => {
    const service = { ingest: vi.fn().mockResolvedValue({ eventId: 'e', verified: false }) } as unknown as WppWebhookService;
    const ctrl = new WppWebhookController(service);
    const { req, res } = makeReqRes([{ EventType: 'messages' }]);

    await ctrl.handle(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('erro do service → next (errorHandler decide o status)', async () => {
    const service = { ingest: vi.fn().mockRejectedValue(new Error('db down')) } as unknown as WppWebhookService;
    const ctrl = new WppWebhookController(service);
    const { req, res } = makeReqRes({ EventType: 'messages' });

    await ctrl.handle(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
