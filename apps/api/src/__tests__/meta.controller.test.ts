import { describe, it, expect, vi } from 'vitest';
import { MetaController } from '../controllers/meta.controller.js';

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
}

describe('MetaController', () => {
  const metaService = { getTenantBusinesses: vi.fn(), getTenantPagesByBusiness: vi.fn() } as any;
  const controller = new MetaController(metaService);

  beforeEach(() => {
    metaService.getTenantBusinesses.mockReset();
    metaService.getTenantPagesByBusiness.mockReset();
  });

  it('happy: getBusinesses retorna businesses do tenant', async () => {
    metaService.getTenantBusinesses.mockResolvedValue([{ id: 'bm-1', name: 'Biz' }]);
    const req = { tenant: { tenantId: 't-1' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await controller.getBusinesses(req, res, next);

    expect(metaService.getTenantBusinesses).toHaveBeenCalledWith('t-1');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: [{ id: 'bm-1', name: 'Biz' }] })
    );
  });

  it('400: getPagesByBusiness com businessIds vazio chama next com ZodError', async () => {
    const req = { tenant: { tenantId: 't-1' }, body: { businessIds: [] } } as any;
    const res = mockRes();
    const next = vi.fn();

    await controller.getPagesByBusiness(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
    expect(res.json).not.toHaveBeenCalled();
    expect(metaService.getTenantPagesByBusiness).not.toHaveBeenCalled();
  });
});