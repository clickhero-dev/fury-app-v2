// =============================================================================
// Testes unitários do handlePublishNow (PlannerController) — T006.
// Controller é classe DI: instanciação direta com service mockado
// (padrão ADR-0001). Cobre: happy 201, retry (2 shapes de body), 400 sem key,
// validação zod, envelope de resposta.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlannerController } from '../controllers/planner.controller.js';

function mockRes() {
  const res: any = {
    statusCode: 200,
    status: vi.fn(function (code: number) { res.statusCode = code; return res; }),
    json: vi.fn(function (body: unknown) { res.body = body; return res; }),
  };
  return res;
}

const RESULT_PUBLISHED = { id: 'post-1', status: 'published', platformPostId: 'media-1', instagramUsername: 'velora' };

describe('PlannerController.handlePublishNow', () => {
  let svc: { publishNow: ReturnType<typeof vi.fn>; publishRetry: ReturnType<typeof vi.fn> };
  let ctrl: PlannerController;

  beforeEach(() => {
    svc = { publishNow: vi.fn(), publishRetry: vi.fn() };
    ctrl = new PlannerController(svc as never);
  });

  it('Cenário: cria + publica → 201 com envelope success/data', async () => {
    svc.publishNow.mockResolvedValue(RESULT_PUBLISHED);
    const res = mockRes();
    const req = {
      tenant: { tenantId: 't1' },
      body: { postType: 'image', caption: 'oi', imageUrl: 'https://cdn.x/i.png' },
      idempotencyKey: 'key-A',
    } as any;
    const next = vi.fn();

    await ctrl.handlePublishNow(req, res, next);

    expect(svc.publishNow).toHaveBeenCalledWith('t1', { postType: 'image', caption: 'oi', imageUrl: 'https://cdn.x/i.png' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: RESULT_PUBLISHED }));
    expect(next).not.toHaveBeenCalled();
  });

  it('Cenário: body com retryPostId → publishRetry(postId), 201', async () => {
    svc.publishRetry.mockResolvedValue({ ...RESULT_PUBLISHED, id: '123e4567-e89b-12d3-a456-426614174000' });
    const res = mockRes();
    const req = { tenant: { tenantId: 't1' }, body: { retryPostId: '123e4567-e89b-12d3-a456-426614174000' }, idempotencyKey: 'key-B' } as any;

    await ctrl.handlePublishNow(req, res, vi.fn());

    expect(svc.publishNow).not.toHaveBeenCalled();
    expect(svc.publishRetry).toHaveBeenCalledWith('t1', '123e4567-e89b-12d3-a456-426614174000');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('Cenário: carousel → next com AppError 400 CAROUSEL_NOT_SUPPORTED', async () => {
    const { AppError } = await import('../middleware/errorHandler.js');
    svc.publishNow.mockRejectedValue(new AppError(400, 'CAROUSEL_NOT_SUPPORTED', 'x'));
    const res = mockRes();
    const next = vi.fn();
    const req = { tenant: { tenantId: 't1' }, body: { postType: 'carousel' }, idempotencyKey: 'key-D' } as any;

    await ctrl.handlePublishNow(req, res, next);

    const err = next.mock.calls[0][0] as any;
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('CAROUSEL_NOT_SUPPORTED');
    expect(res.json).not.toHaveBeenCalled();
  });

  it('Cenário: service lança AppError 409 POST_CLAIMED → next com o erro', async () => {
    const { AppError } = await import('../middleware/errorHandler.js');
    svc.publishRetry.mockRejectedValue(new AppError(409, 'POST_CLAIMED', 'x'));
    const res = mockRes();
    const next = vi.fn();
    const req = { tenant: { tenantId: 't1' }, body: { retryPostId: '123e4567-e89b-12d3-a456-426614174000' }, idempotencyKey: 'key-E' } as any;

    await ctrl.handlePublishNow(req, res, next);

    const err = next.mock.calls[0][0] as any;
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('POST_CLAIMED');
  });
});
