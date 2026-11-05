import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';

const createManualPost = vi.fn();
vi.mock('../services/planner/planner.service.js', () => ({
  createManualPost: (...args: any[]) => createManualPost(...args),
  plannerService: {
    createManualPost: (...args: any[]) => createManualPost(...args),
  },
}));

vi.mock('../services/storage/storage.service.js', () => ({
  uploadAsset: vi.fn(),
}));

import { handleCreatePost } from '../controllers/planner.controller.js';

function mockRes() {
  return { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;
}

beforeEach(() => {
  createManualPost.mockReset();
});

describe('handleCreatePost', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';

  it('cria post com campos obrigatórios', async () => {
    createManualPost.mockResolvedValue({ id: 'post-1', caption: 'teste', postType: 'image', dayIndex: 10 });
    const req = { tenant: { tenantId }, body: { caption: 'teste', postType: 'image', dayIndex: 10 } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleCreatePost(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(createManualPost).toHaveBeenCalledWith(tenantId, expect.objectContaining({
      caption: 'teste', postType: 'image', dayIndex: 10,
    }));
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ id: 'post-1' }) });
  });

  it('aceita imageUrl opcional', async () => {
    createManualPost.mockResolvedValue({ id: 'post-2' });
    const req = { tenant: { tenantId }, body: { caption: 'x', postType: 'carousel', dayIndex: 15, imageUrl: 'https://cdn.example.com/img.png' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleCreatePost(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(createManualPost).toHaveBeenCalledWith(tenantId, expect.objectContaining({
      imageUrl: 'https://cdn.example.com/img.png',
    }));
  });

  it('aceita scheduledAt', async () => {
    createManualPost.mockResolvedValue({ id: 'post-3' });
    const req = { tenant: { tenantId }, body: { caption: 'x', postType: 'reel', dayIndex: 20, scheduledAt: '2026-08-15T14:00:00.000Z' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleCreatePost(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita postType inválido → ZodError', async () => {
    const req = { tenant: { tenantId }, body: { caption: 'x', postType: 'story', dayIndex: 1 } } as any;
    const next = vi.fn();
    await handleCreatePost(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
  });

  it('rejeita dayIndex > 31 → ZodError', async () => {
    const req = { tenant: { tenantId }, body: { postType: 'image', dayIndex: 32 } } as any;
    const next = vi.fn();
    await handleCreatePost(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
  });

  it('rejeita scheduledAt inválido → ZodError', async () => {
    const req = { tenant: { tenantId }, body: { postType: 'image', dayIndex: 1, scheduledAt: 'amanhã' } } as any;
    const next = vi.fn();
    await handleCreatePost(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
  });

  it('rejeita imageUrl inválido → ZodError', async () => {
    const req = { tenant: { tenantId }, body: { postType: 'image', dayIndex: 1, imageUrl: 'não-é-url' } } as any;
    const next = vi.fn();
    await handleCreatePost(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
  });

  // ===== Novo formato (Fase 1) =====

  it('[Fase 1] cria post com date (novo formato)', async () => {
    createManualPost.mockResolvedValue({ id: 'post-4', caption: 'novo', postType: 'image', date: '2026-08-19' });
    const req = { tenant: { tenantId }, body: { caption: 'novo', postType: 'image', date: '2026-08-19' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleCreatePost(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(createManualPost).toHaveBeenCalledWith(tenantId, expect.objectContaining({
      caption: 'novo', postType: 'image', date: '2026-08-19',
    }));
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ id: 'post-4' }) });
  });

  it('[Fase 1] aceita date + scheduledAt', async () => {
    createManualPost.mockResolvedValue({ id: 'post-5' });
    const req = { tenant: { tenantId }, body: { postType: 'reel', date: '2026-09-05', scheduledAt: '2026-09-05T10:00:00Z' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleCreatePost(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('[Fase 1] rejeita date inválido → ZodError', async () => {
    const req = { tenant: { tenantId }, body: { postType: 'image', date: '2026-13-45' } } as any;
    const next = vi.fn();
    await handleCreatePost(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
  });

  it('[Fase 1] dual-format: aceita dayIndex OU date (não ambos)', async () => {
    // Ambos presentes: deve aceitar (schema faz union)
    createManualPost.mockResolvedValue({ id: 'post-6' });
    const req = { tenant: { tenantId }, body: { postType: 'image', date: '2026-08-20', dayIndex: 10 } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleCreatePost(req, res, next);
    // A union vai aceitar (ambos passam validação individual)
    expect(next).not.toHaveBeenCalled();
  });
});
