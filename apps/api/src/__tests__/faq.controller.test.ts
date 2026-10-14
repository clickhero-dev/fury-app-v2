import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FaqController } from '../controllers/faq.controller.js';

function repo() {
  return {
    listAdmin: vi.fn(), findById: vi.fn(), findBySlug: vi.fn(),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), addSlugRedirect: vi.fn(),
    searchPublished: vi.fn(), findPublishedBySlug: vi.fn(), findRedirect: vi.fn(),
  };
}
function res() { const value: any = {}; value.status = vi.fn().mockReturnValue(value); value.json = vi.fn().mockReturnValue(value); return value; }

describe('FaqController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a draft with a generated slug', async () => {
    const r = repo(); r.findBySlug.mockResolvedValue(null); r.create.mockResolvedValue({ id: 'faq-1', slug: 'como-comecar', status: 'draft' });
    const controller = new FaqController(r as any);
    const response = res(); const next = vi.fn();
    await controller.create({ body: { title: 'Como começar?', markdown: '# Olá' } } as any, response, next);
    expect(r.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Como começar?', slug: 'como-comecar', status: 'draft' }));
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('rejects a duplicate slug', async () => {
    const r = repo(); r.findBySlug.mockResolvedValue({ id: 'other' });
    const controller = new FaqController(r as any); const next = vi.fn();
    await controller.create({ body: { title: 'Olá', slug: 'ja-existe', markdown: 'texto' } } as any, res(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409, code: 'FAQ_SLUG_EXISTS' }));
  });

  it('validates invalid FAQ payloads before touching persistence', async () => {
    const r = repo(); const next = vi.fn();
    await new FaqController(r as any).create({ body: { title: '', markdown: '' } } as any, res(), next);
    expect(r.create).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('requires an existing FAQ before deletion', async () => {
    const r = repo(); r.findById.mockResolvedValue(null); const next = vi.fn();
    await new FaqController(r as any).delete({ params: { id: 'missing' } } as any, res(), next);
    expect(r.delete).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('returns canonical slug for a historic public URL', async () => {
    const r = repo(); r.findPublishedBySlug.mockResolvedValue(null); r.findRedirect.mockResolvedValue({ faq: { id: 'faq-1', slug: 'novo', status: 'published' } });
    const controller = new FaqController(r as any); const response = res();
    await controller.getPublicBySlug({ params: { slug: 'antigo' } } as any, response, vi.fn());
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ canonicalSlug: 'novo' }) }));
  });

  it('does not expose drafts publicly', async () => {
    const r = repo(); r.findPublishedBySlug.mockResolvedValue(null); r.findRedirect.mockResolvedValue(null);
    const controller = new FaqController(r as any); const next = vi.fn();
    await controller.getPublicBySlug({ params: { slug: 'rascunho' } } as any, res(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404, code: 'FAQ_NOT_FOUND' }));
  });
});
