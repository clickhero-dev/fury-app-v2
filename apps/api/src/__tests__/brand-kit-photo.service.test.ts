import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrandKitPhotoService } from '../services/brand-kit/brand-kit-photo.service.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

function makeRepo(override: Record<string, any> = {}) {
  return {
    list: vi.fn(async () => [{ id: 'p1', kind: 'modelo', url: 'https://cdn/p1.png', createdAt: new Date('2026-10-07') }]),
    create: vi.fn(async (d: any) => ({ id: `id-${d.url.slice(-8)}`, createdAt: new Date(), ...d })),
    softDeleteById: vi.fn(async () => ({ id: 'p1', url: 'https://cdn/p1.png' })),
    findBrandKit: vi.fn(async () => ({ id: 'bk-1' })),
    upsertTenantBrandKit: vi.fn(async () => ({ id: 'bk-new' })),
    ...override,
  };
}

let repo: any;
let factory: any;
const storage = {
  uploadAsset: vi.fn(async (_b: Buffer, key: string) => `https://cdn/${key}`),
  deleteAsset: vi.fn(async () => undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
  repo = makeRepo();
  factory = vi.fn(() => repo);
});

describe('BrandKitPhotoService', () => {
  it('list repassa o filtro de tipo e devolve no formato da API', async () => {
    const svc = new BrandKitPhotoService(factory, storage as any);
    const out = await svc.list('t-1', 'modelo');
    expect(factory).toHaveBeenCalledWith('t-1');
    expect(repo.list).toHaveBeenCalledWith('modelo');
    expect(out).toEqual([{ id: 'p1', kind: 'modelo', url: 'https://cdn/p1.png', created_at: expect.any(Date) }]);
  });

  it('upload grava cada arquivo com o tipo escolhido, vinculado ao brand kit', async () => {
    const svc = new BrandKitPhotoService(factory, storage as any);
    const out = await svc.upload('t-1', 'produto', [
      { buffer: PNG, mimetype: 'image/png' },
      { buffer: JPG, mimetype: 'image/jpeg' },
    ]);
    expect(storage.uploadAsset).toHaveBeenCalledTimes(2);
    expect(storage.uploadAsset.mock.calls[0][1]).toMatch(/^brand-kit\/t-1\/library\/produto\/.+\.png$/);
    expect(storage.uploadAsset.mock.calls[1][1]).toMatch(/\.jpg$/);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ brandKitId: 'bk-1', kind: 'produto' }));
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.kind === 'produto')).toBe(true);
  });

  it('upload cria brand kit vazio quando o tenant ainda não tem', async () => {
    repo = makeRepo({ findBrandKit: vi.fn(async () => undefined) });
    const svc = new BrandKitPhotoService(() => repo, storage as any);
    await svc.upload('t-1', 'equipe', [{ buffer: PNG, mimetype: 'image/png' }]);
    expect(repo.upsertTenantBrandKit).toHaveBeenCalledWith({});
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ brandKitId: 'bk-new' }));
  });

  it('upload rejeita arquivo cujo conteúdo não é PNG/JPG, sem enviar nada', async () => {
    const svc = new BrandKitPhotoService(factory, storage as any);
    await expect(
      svc.upload('t-1', 'modelo', [
        { buffer: PNG, mimetype: 'image/png' },
        { buffer: Buffer.from('<svg></svg>'), mimetype: 'image/png' },
      ]),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(storage.uploadAsset).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('upload que falha no meio: o lote sai da biblioteca (soft delete) e o arquivo sem linha é apagado', async () => {
    repo = makeRepo({
      create: vi.fn()
        .mockResolvedValueOnce({ id: 'ok-1', kind: 'produto', url: 'u1', createdAt: new Date() })
        .mockRejectedValueOnce(new Error('db caiu')),
    });
    const svc = new BrandKitPhotoService(() => repo, storage as any);
    await expect(svc.upload('t-1', 'produto', [
      { buffer: PNG, mimetype: 'image/png' },
      { buffer: JPG, mimetype: 'image/jpeg' },
    ])).rejects.toThrow('db caiu');
    expect(repo.softDeleteById).toHaveBeenCalledWith('ok-1');
    // só o 2º arquivo (subiu, mas a linha falhou) sai do storage
    expect(storage.deleteAsset).toHaveBeenCalledTimes(1);
  });

  it('upload sem arquivos → 400', async () => {
    const svc = new BrandKitPhotoService(factory, storage as any);
    await expect(svc.upload('t-1', 'modelo', [])).rejects.toMatchObject({ statusCode: 400 });
  });

  it('remove é soft delete: marca a linha e mantém o arquivo no storage', async () => {
    const svc = new BrandKitPhotoService(factory, storage as any);
    await svc.remove('t-1', 'p1');
    expect(repo.softDeleteById).toHaveBeenCalledWith('p1');
    expect(storage.deleteAsset).not.toHaveBeenCalled();
  });

  it('remove de id de outro tenant → 404, sem tocar no storage', async () => {
    repo = makeRepo({ softDeleteById: vi.fn(async () => undefined) });
    const svc = new BrandKitPhotoService(() => repo, storage as any);
    await expect(svc.remove('t-1', 'p-outro')).rejects.toMatchObject({ statusCode: 404 });
    expect(storage.deleteAsset).not.toHaveBeenCalled();
  });
});
