import { describe, it, expect, vi } from 'vitest';
import { PlannerService } from '../services/planner/planner.service.js';

const BASE = {
  id: 'p1', postType: 'image', status: 'draft',
  imageUrl: 'https://cdn.x/a.png', imageUrls: [], calendarDate: '2026-10-10',
};

function makeService(current: Record<string, unknown> | null = BASE) {
  const repo = {
    findPostById: vi.fn(async () => current),
    patchPostIfEditable: vi.fn(async (_id: string, data: Record<string, unknown>) => ({ ...current, ...data })),
  };
  return { svc: new PlannerService(() => repo as never, {} as never), repo };
}

describe('updatePostFields — edição pelo calendário', () => {
  it('agendar: dia do calendário segue o horário de Brasília e libera para o job', async () => {
    const { svc, repo } = makeService();
    // 01:30Z do dia 21 = 22:30 do dia 20 em Brasília
    await svc.updatePostFields('p1', 't1', { scheduledAt: '2026-10-21T01:30:00.000Z' });

    expect(repo.patchPostIfEditable).toHaveBeenCalledWith('p1', expect.objectContaining({
      calendarDate: '2026-10-20', dayIndex: 20, status: 'approved', publishAttempts: 0, lastPublishError: null,
    }));
  });

  it('desagendar: volta para draft', async () => {
    const { svc, repo } = makeService({ ...BASE, status: 'approved' });
    await svc.updatePostFields('p1', 't1', { scheduledAt: null });
    expect(repo.patchPostIfEditable).toHaveBeenCalledWith('p1', expect.objectContaining({ scheduledAt: null, status: 'draft' }));
  });

  it('só legenda: não mexe em status nem data', async () => {
    const { svc, repo } = makeService();
    await svc.updatePostFields('p1', 't1', { caption: 'nova' });
    const data = repo.patchPostIfEditable.mock.calls[0][1];
    expect(data.caption).toBe('nova');
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('calendarDate');
  });

  it('trocar para carrossel com 2 imagens: ok', async () => {
    const { svc, repo } = makeService();
    await svc.updatePostFields('p1', 't1', { postType: 'carousel', imageUrl: null, imageUrls: ['https://cdn.x/a.png', 'https://cdn.x/b.png'] });
    expect(repo.patchPostIfEditable).toHaveBeenCalledWith('p1', expect.objectContaining({ postType: 'carousel', imageUrl: null }));
  });

  it('trocar para reels com imagem: 400 REEL_REQUIRES_VIDEO', async () => {
    const { svc, repo } = makeService();
    await expect(svc.updatePostFields('p1', 't1', { postType: 'reel' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'REEL_REQUIRES_VIDEO' });
    expect(repo.patchPostIfEditable).not.toHaveBeenCalled();
  });

  it('carrossel misturando imagem e vídeo: 400', async () => {
    const { svc } = makeService();
    await expect(svc.updatePostFields('p1', 't1', { postType: 'carousel', imageUrls: ['https://cdn.x/a.png', 'https://cdn.x/b.mp4'] }))
      .rejects.toMatchObject({ statusCode: 400, code: 'CAROUSEL_MIXED_MEDIA' });
  });

  it('post publicado: 409 POST_LOCKED', async () => {
    const { svc, repo } = makeService({ ...BASE, status: 'published' });
    await expect(svc.updatePostFields('p1', 't1', { caption: 'x' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'POST_LOCKED' });
    expect(repo.patchPostIfEditable).not.toHaveBeenCalled();
  });

  it('post excluído (rejected): 404, não ressuscita', async () => {
    const { svc, repo } = makeService({ ...BASE, status: 'rejected' });
    await expect(svc.updatePostFields('p1', 't1', { scheduledAt: '2099-01-01T12:00:00.000Z' }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(repo.patchPostIfEditable).not.toHaveBeenCalled();
  });

  it('corrida: job pegou o post entre a leitura e o UPDATE → 409, sem sobrescrever', async () => {
    const { svc, repo } = makeService();
    repo.patchPostIfEditable.mockResolvedValueOnce(null as never);
    await expect(svc.updatePostFields('p1', 't1', { scheduledAt: '2099-01-01T12:00:00.000Z' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'POST_LOCKED' });
  });

  it('agendar post sem mídia: 400 MEDIA_REQUIRED', async () => {
    const { svc } = makeService({ ...BASE, imageUrl: null });
    await expect(svc.updatePostFields('p1', 't1', { scheduledAt: '2099-01-01T12:00:00.000Z' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'MEDIA_REQUIRED' });
  });
});

describe('movePostDate/movePostDay — post publicado não muda de dia', () => {
  it('publicado: 409 POST_LOCKED, nada é gravado', async () => {
    const { svc, repo } = makeService({ ...BASE, status: 'published' });
    await expect(svc.movePostDate('t1', 'p1', '2099-01-02'))
      .rejects.toMatchObject({ statusCode: 409, code: 'POST_LOCKED' });
    await expect(svc.movePostDay('t1', 'p1', 2))
      .rejects.toMatchObject({ statusCode: 409, code: 'POST_LOCKED' });
    expect(repo.patchPostIfEditable).not.toHaveBeenCalled();
  });

  it('publicando: 409', async () => {
    const { svc } = makeService({ ...BASE, status: 'publishing' });
    await expect(svc.movePostDate('t1', 'p1', '2099-01-02')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('agendado: move dia e horário', async () => {
    const { svc, repo } = makeService({ ...BASE, status: 'approved' });
    await svc.movePostDate('t1', 'p1', '2099-01-02', '2099-01-02T15:00:00.000Z');
    expect(repo.patchPostIfEditable).toHaveBeenCalledWith('p1', expect.objectContaining({
      calendarDate: '2099-01-02', scheduledAt: new Date('2099-01-02T15:00:00.000Z'),
    }));
  });

  it('corrida: publicou entre a leitura e o UPDATE → 409', async () => {
    const { svc, repo } = makeService({ ...BASE, status: 'approved' });
    repo.patchPostIfEditable.mockResolvedValueOnce(null as never);
    await expect(svc.movePostDate('t1', 'p1', '2099-01-02')).rejects.toMatchObject({ statusCode: 409 });
  });
});

