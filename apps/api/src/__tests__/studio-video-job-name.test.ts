// Funcionalidade: nome descritivo dos jobs de vídeo do Studio
/*
  Funcionalidade: identificar jobs de geração de vídeo

  Cenário: o envio de vídeo cria um job com nome padronizado
    Dado um workflow de vídeo aprovado
    Quando o Studio enfileira a geração
    Então o job se chama worker-studio-video-generate e preserva o ID do workflow
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ add: vi.fn(async () => ({ id: 'video-job-1' })) }));
vi.mock('bullmq', () => ({
  Queue: class QueueMock {
    add(...args: any[]) { return state.add(...args); }
  },
}));
vi.mock('../lib/redis.js', () => ({ getRedis: vi.fn(() => ({})) }));

import { enqueueStudioVideo } from '../workers/studio-video.worker.js';

describe('Studio video job naming', () => {
  beforeEach(() => state.add.mockClear());

  it('Cenário: cria vídeo com nome padronizado e ID estável', async () => {
    await enqueueStudioVideo('workflow-1', 'tenant-1');

    expect(state.add).toHaveBeenCalledWith(
      'worker-studio-video-generate',
      { jobId: 'workflow-1', tenantId: 'tenant-1' },
      expect.objectContaining({ jobId: 'workflow-1', attempts: 1 }),
    );
  });
});
