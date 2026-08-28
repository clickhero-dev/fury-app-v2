import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardController } from '../controllers/dashboard.controller.js';

function mockRes() {
  const json = vi.fn();
  return { json } as any;
}

describe('DashboardController — happy path', () => {
  it('getInstagramInsightsHandler responde com os insights quando tenant tem conexão', async () => {
    const getInsights = vi.fn().mockResolvedValue({
      comments: 12,
      saves: 4,
      followers: -2,
      period: { from: '2026-08-01', to: '2026-08-07' },
    });
    const c = new DashboardController(getInsights as any);

    const req = { tenant: { tenantId: 't-1' }, query: { date_from: '2026-08-01', date_to: '2026-08-07' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await c.getInstagramInsightsHandler(req, res, next);

    expect(getInsights).toHaveBeenCalledWith('t-1', '2026-08-01', '2026-08-07');
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ comments: 12 }),
      }),
    );
  });
});

describe('DashboardController — errors', () => {
  it('propaga AppError 401 quando tenant ausente', async () => {
    const getInsights = vi.fn();
    const c = new DashboardController(getInsights as any);

    const req = { tenant: null, query: { date_from: '2026-08-01', date_to: '2026-08-07' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await c.getInstagramInsightsHandler(req, res, next);

    expect(getInsights).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }));
  });

  it('propaga ZodError (400) quando date_from falta', async () => {
    const getInsights = vi.fn();
    const c = new DashboardController(getInsights as any);

    const req = { tenant: { tenantId: 't-1' }, query: { date_to: '2026-08-07' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await c.getInstagramInsightsHandler(req, res, next);

    expect(getInsights).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});