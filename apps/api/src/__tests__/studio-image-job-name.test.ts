// Funcionalidade: nome descritivo dos jobs de imagem gerados pelo planner
/*
  Funcionalidade: identificar jobs de criação de imagem na fila do Studio

  Cenário: cada imagem do plano é enfileirada com nome padronizado
    Dado um post do plano aguardando imagem
    Quando o planner enfileira a geração
    Então o job se chama worker-studio-image-generate
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { add } = vi.hoisted(() => ({ add: vi.fn(async () => ({ id: 'image-job-1' })) }));
vi.mock('../lib/queue.js', () => ({ getStudioQueue: vi.fn(async () => ({ add })) }));
vi.mock('../planner-store.js', () => ({ plannerStore: {} }));
vi.mock('../repository/planner.repository.js', () => ({ PlannerRepository: class {} }));

import { enqueuePlannerImageJobs } from '../services/planner/planner-studio.service.js';

describe('Studio image job naming', () => {
  beforeEach(() => add.mockClear());

  it('Cenário: enfileira cada imagem com nome padronizado', async () => {
    await enqueuePlannerImageJobs({
      tenantId: 'tenant-1',
      planId: 'plan-1',
      posts: [{ date: '2026-11-01', postType: 'feed' } as any],
    });

    expect(add).toHaveBeenCalledWith(
      'worker-studio-image-generate',
      expect.objectContaining({ mode: 'planner', tenantId: 'tenant-1', planId: 'plan-1' }),
      expect.objectContaining({ attempts: 2 }),
    );
  });
});
