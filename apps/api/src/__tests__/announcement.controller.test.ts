import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementController } from '../controllers/announcement.controller.js';
import { findInventedContent } from '../services/llms/announcement-formatter.js';

const ID = '7f3c2a10-1b2c-4d5e-8f90-a1b2c3d4e5f6';
function repo() {
  return { listAdmin: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listPending: vi.fn(), markSeen: vi.fn() };
}
function res() { const value: any = {}; value.status = vi.fn().mockReturnValue(value); value.json = vi.fn().mockReturnValue(value); return value; }

describe('AnnouncementController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets publishedAt when created active', async () => {
    const r = repo(); r.create.mockResolvedValue({ id: ID });
    const response = res();
    await new AnnouncementController(r as any).create({ body: { title: 'Novidade', markdown: '# Oi', isActive: true } } as any, response, vi.fn());
    expect(r.create).toHaveBeenCalledWith(expect.objectContaining({ isActive: true, publishedAt: expect.any(Date), showToNewUsers: false, endsAt: null }));
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('rejects "Manter ativo" together with an end date', async () => {
    const r = repo(); const next = vi.fn();
    await new AnnouncementController(r as any).create({ body: { title: 'Evento', markdown: 'x', showToNewUsers: true, endsAt: '2026-12-01T00:00:00Z' } } as any, res(), next);
    expect(r.create).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'ANNOUNCEMENT_MODE_CONFLICT' }));
  });

  it('keeps a draft unpublished', async () => {
    const r = repo(); r.create.mockResolvedValue({ id: ID });
    await new AnnouncementController(r as any).create({ body: { title: 'Rascunho', markdown: 'x' } } as any, res(), vi.fn());
    expect(r.create).toHaveBeenCalledWith(expect.objectContaining({ isActive: false, publishedAt: null }));
  });

  it('keeps the original publishedAt when re-activated', async () => {
    const first = new Date('2026-01-01T10:00:00Z');
    const r = repo(); r.findById.mockResolvedValue({ id: ID, isActive: false, publishedAt: first });
    await new AnnouncementController(r as any).update({ params: { id: ID }, body: { isActive: true } } as any, res(), vi.fn());
    expect(r.update).toHaveBeenCalledWith(ID, expect.objectContaining({ isActive: true, publishedAt: first }));
  });

  it('partial update does not reset omitted fields', async () => {
    const r = repo(); r.findById.mockResolvedValue({ id: ID, isActive: true, publishedAt: new Date() });
    await new AnnouncementController(r as any).update({ params: { id: ID }, body: { title: 'Novo título' } } as any, res(), vi.fn());
    const data = r.update.mock.calls[0][1];
    expect(data).not.toHaveProperty('isActive');
    expect(data).not.toHaveProperty('endsAt');
  });

  it('uses the user id from the token for pending and seen', async () => {
    const r = repo(); r.listPending.mockResolvedValue([]); r.findById.mockResolvedValue({ id: ID });
    const controller = new AnnouncementController(r as any);
    const req = { user: { userId: 'user-1' }, params: { id: ID }, body: { userId: 'other' } } as any;
    await controller.listPending(req, res(), vi.fn());
    await controller.markSeen(req, res(), vi.fn());
    expect(r.listPending).toHaveBeenCalledWith('user-1');
    expect(r.markSeen).toHaveBeenCalledWith('user-1', ID);
  });

  it('rejects marking an unknown announcement as seen', async () => {
    const r = repo(); r.findById.mockResolvedValue(null); const next = vi.fn();
    await new AnnouncementController(r as any).markSeen({ user: { userId: 'user-1' }, params: { id: ID } } as any, res(), next);
    expect(r.markSeen).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('validates the text before calling the AI', async () => {
    const format = vi.fn(); const next = vi.fn();
    await new AnnouncementController(repo() as any, format).formatText({ body: { text: '   ' } } as any, res(), next);
    expect(format).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});

describe('findInventedContent', () => {
  const original = 'novo recurso de relatorios dia 15 as 10h, veja em https://ady.com/ajuda';

  it('accepts formatting with list markers and the same facts', () => {
    const md = '## Novo recurso de relatórios\n\n1. Disponível dia **15** às 10h\n2. Veja em https://ady.com/ajuda';
    expect(findInventedContent(original, md)).toEqual([]);
  });

  it('flags numbers, links and contacts that were not in the text', () => {
    const md = 'Novo recurso de relatórios dia 15 às 10h, com 20% de desconto. Veja em https://ady.com/promo ou fale com suporte@ady.com';
    expect(findInventedContent(original, md)).toEqual(expect.arrayContaining(['20', 'https://ady.com/promo', 'suporte@ady.com']));
  });

  it('flags output much longer than the original', () => {
    expect(findInventedContent('Oi pessoal', 'palavra '.repeat(40))).toContain('texto muito maior que o original');
  });
});
