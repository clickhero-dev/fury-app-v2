// Funcionalidade: nome descritivo dos jobs de vídeo do Studio
/*
  Funcionalidade: identificar jobs de geração de vídeo

  Cenário: o envio de vídeo cria um job com nome padronizado
    Dado um workflow de vídeo aprovado
    Quando o Studio enfileira a geração
    Então o job se chama worker-studio-video-generate e preserva o ID do workflow
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ add: vi.fn(async () => ({ id: 'video-job-1' })), getJob: vi.fn(async () => undefined as any) }));
vi.mock('bullmq', () => ({
  Queue: class QueueMock {
    add(...args: any[]) { return state.add(...args); }
    getJob(...args: any[]) { return state.getJob(...args); }
  },
}));
vi.mock('../lib/redis.js', () => ({ getRedis: vi.fn(() => ({})) }));

import { enqueueStudioVideo } from '../workers/studio-video.worker.js';

describe('Studio video job naming', () => {
  beforeEach(() => { state.add.mockClear(); state.getJob.mockReset().mockResolvedValue(undefined); });

  it('Cenário: cria vídeo com nome padronizado e ID estável', async () => {
    await enqueueStudioVideo('workflow-1', 'tenant-1');

    expect(state.add).toHaveBeenCalledWith(
      'worker-studio-video-generate',
      { jobId: 'workflow-1', tenantId: 'tenant-1' },
      expect.objectContaining({ jobId: 'workflow-1', attempts: 1 }),
    );
  });
  it('remove fila terminada antes de reenfileirar job ainda pendente no banco', async () => {
    const remove=vi.fn().mockResolvedValue(undefined);
    state.getJob.mockResolvedValueOnce({getState:async()=> 'failed',remove});
    await enqueueStudioVideo('workflow-1','tenant-1');
    expect(remove).toHaveBeenCalledOnce();expect(state.add).toHaveBeenCalledOnce();
  });
});
