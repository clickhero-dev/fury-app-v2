import { describe, it, expect, vi } from 'vitest';
import { BrandKitPhotoController } from '../controllers/brand-kit-photo.controller.js';

const id = '123e4567-e89b-12d3-a456-426614174000';
function setup(photoId = id) {
  const service = { hideFromReferencePanel: vi.fn().mockResolvedValue(undefined) };
  const controller = new BrandKitPhotoController(service as never);
  const req = { tenant: { tenantId: 'tenant-a' }, params: { id: photoId } } as never;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  return { service, controller, req, res, next };
}
describe('ocultar imagem do painel', () => {
  it('passa o tenant autenticado e confirma o resultado', async () => {
    const { service, controller, req, res, next } = setup();
    await controller.hideFromReferencePanel(req, res as never, next);
    expect(service.hideFromReferencePanel).toHaveBeenCalledWith('tenant-a', id);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
  it('rejeita identificador inválido', async () => {
    const { service, controller, req, res, next } = setup('inválido');
    await controller.hideFromReferencePanel(req, res as never, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(service.hideFromReferencePanel).not.toHaveBeenCalled();
  });
  it('propaga falhas para o tratamento de erros', async () => {
    const { service, controller, req, res, next } = setup();
    const error = new Error('banco indisponível');
    service.hideFromReferencePanel.mockRejectedValue(error);
    await controller.hideFromReferencePanel(req, res as never, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
