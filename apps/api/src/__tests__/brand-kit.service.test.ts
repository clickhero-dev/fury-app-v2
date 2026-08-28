import { describe, it, expect, vi } from 'vitest';
import { BrandKitService, MAX_PHOTOS } from '../services/brand-kit/brand-kit.service.js';

const row = {
  id: 'bk-1',
  tenantId: 't-1',
  logoUrl: 'https://cdn/x.svg',
  primaryColor: '#1E88A8',
  secondaryColor: '#CF6F03',
  voiceTone: 'professional',
  photoUrls: ['https://cdn/a.jpg'],
  whatsappNumber: '5511999999999',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
};

function makeRepo(override: Record<string, any> = {}) {
  return {
    findBrandKit: vi.fn(async () => row),
    upsertTenantBrandKit: vi.fn(async (d: any) => ({ ...row, ...d })),
    updateTenantBrandKit: vi.fn(async () => {}),
    ...override,
  };
}
const storage = { uploadAsset: vi.fn(async () => 'https://cdn/new.png'), deleteAsset: vi.fn(async () => {}) };
let repo = makeRepo();
const svc = new BrandKitService(() => repo as any, storage as any);

describe('BrandKitService', () => {
  it('getBrandKit serializa a resposta (snake_case)', async () => {
    const out = await svc.getBrandKit('t-1');
    expect(out).not.toBeNull();
    expect(out!.primary_color).toBe('#1E88A8');
    expect(out!.photo_urls).toEqual(['https://cdn/a.jpg']);
    expect(out!.whatsapp_number).toBe('5511999999999');
  });

  it('getBrandKit sem kit → null', async () => {
    repo = makeRepo({ findBrandKit: vi.fn(async () => null) });
    expect(await svc.getBrandKit('t-1')).toBeNull();
  });

  it('upsertBrandKit persiste e serializa', async () => {
    const out = await svc.upsertBrandKit('t-1', { primaryColor: '#000000' });
    expect(repo.upsertTenantBrandKit).toHaveBeenCalled();
    expect(out.primary_color).toBe('#000000');
  });

  it('uploadLogo devolve url via storage', async () => {
    const { url } = await svc.uploadLogo('t-1', { buffer: Buffer.from('x'), mimetype: 'image/svg+xml' });
    expect(url).toBe('https://cdn/new.png');
    expect(storage.uploadAsset).toHaveBeenCalled();
  });

  it('uploadPhotos respeita MAX_PHOTOS', async () => {
    repo = makeRepo({ findBrandKit: vi.fn(async () => ({ ...row, photoUrls: Array(MAX_PHOTOS).fill('x') })) });
    const res = await svc.uploadPhotos('t-1', [{ buffer: Buffer.from('a'), mimetype: 'image/png' }]);
    expect('error' in res).toBe(true);
    expect((res as any).existingPhotos).toBe(MAX_PHOTOS);
  });

  it('uploadPhotos concatena com fotos existentes', async () => {
    repo = makeRepo();
    const res = await svc.uploadPhotos('t-1', [{ buffer: Buffer.from('a'), mimetype: 'image/jpeg' }]);
    expect('urls' in res).toBe(true);
    expect(repo.upsertTenantBrandKit).toHaveBeenCalledWith({ photoUrls: ['https://cdn/a.jpg', 'https://cdn/new.png'] });
  });

  it('deletePhoto remove url e chama storage.deleteAsset', async () => {
    repo = makeRepo();
    const list = await svc.deletePhoto('t-1', 'https://cdn/a.jpg');
    expect(list).toEqual([]);
    expect(repo.updateTenantBrandKit).toHaveBeenCalled();
    expect(storage.deleteAsset).toHaveBeenCalledWith('https://cdn/a.jpg');
  });
});