import { describe, it, expect, vi } from 'vitest';
import { PlannerService } from '../services/planner/planner.service.js';

function makeService(createLibraryAsset = vi.fn(async () => ({ id: 'asset-1' }))) {
  const repo = { createLibraryAsset };
  return { svc: new PlannerService(() => repo as never, {} as never), createLibraryAsset };
}

describe('saveUploadToLibrary — upload do post vai para a biblioteca', () => {
  it('imagem → asset image', async () => {
    const { svc, createLibraryAsset } = makeService();
    await svc.saveUploadToLibrary('t1', 'https://cdn.x/a.png', 'image/png');
    expect(createLibraryAsset).toHaveBeenCalledWith('image', 'https://cdn.x/a.png');
  });

  it('vídeo → asset video', async () => {
    const { svc, createLibraryAsset } = makeService();
    await svc.saveUploadToLibrary('t1', 'https://cdn.x/v.mp4', 'video/mp4');
    expect(createLibraryAsset).toHaveBeenCalledWith('video', 'https://cdn.x/v.mp4');
  });

  it('falha ao gravar não quebra o upload', async () => {
    const { svc } = makeService(vi.fn(async () => { throw new Error('db down'); }));
    await expect(svc.saveUploadToLibrary('t1', 'https://cdn.x/a.png', 'image/png')).resolves.toBeUndefined();
  });
});
