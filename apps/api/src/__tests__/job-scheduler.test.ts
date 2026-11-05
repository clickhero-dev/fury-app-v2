// Funcionalidade: migrar schedulers recorrentes para BullMQ Job Schedulers
/*
  Funcionalidade: substituir repeatables legados sem criar cron duplicado

  Cenário: scheduler antigo é removido antes do novo registro
    Dado que a fila contém um repeatable legado e outro não relacionado
    Quando o scheduler padronizado é atualizado
    Então somente o repeatable legado é removido antes do upsert

  Cenário: falha ao remover legado impede registrar uma segunda recorrência
    Dado que não foi possível remover o repeatable antigo
    Quando o scheduler padronizado é atualizado
    Então o erro é propagado e o novo scheduler não é criado
*/
import { describe, expect, it, vi } from 'vitest';
import { replaceLegacyRepeatablesWithScheduler } from '../lib/job-scheduler.js';

describe('replaceLegacyRepeatablesWithScheduler', () => {
  it('Cenário: remove somente nomes legados e atualiza o scheduler estável', async () => {
    const queue = {
      getRepeatableJobs: vi.fn(async () => [
        { name: 'old-tick', key: 'old-tick-key' },
        { name: 'unrelated-job', key: 'unrelated-key' },
      ]),
      removeRepeatableByKey: vi.fn(async () => true),
      getJobSchedulers: vi.fn(async () => [
        { key: 'old-scheduler', id: null },
        { key: 'unrelated-scheduler', id: null },
      ]),
      removeJobScheduler: vi.fn(async () => true),
      upsertJobScheduler: vi.fn(async () => ({ id: 'next-job' })),
    };

    await replaceLegacyRepeatablesWithScheduler(
      queue,
      ['old-tick'],
      ['old-scheduler'],
      'scheduler-id',
      { pattern: '*/15 * * * *' },
      { name: 'cron-meta-sync-ad-account-data', data: {} },
    );

    expect(queue.removeRepeatableByKey).toHaveBeenCalledTimes(1);
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('old-tick-key');
    expect(queue.removeJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith('old-scheduler');
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'scheduler-id',
      { pattern: '*/15 * * * *' },
      { name: 'cron-meta-sync-ad-account-data', data: {} },
    );
    expect(queue.removeJobScheduler.mock.invocationCallOrder[0])
      .toBeLessThan(queue.upsertJobScheduler.mock.invocationCallOrder[0]);
  });

  it('Cenário: falha ao remover repeatable antigo não cria scheduler duplicado', async () => {
    const queue = {
      getRepeatableJobs: vi.fn(async () => [{ name: 'old-tick', key: 'old-tick-key' }]),
      removeRepeatableByKey: vi.fn(async () => { throw new Error('redis unavailable'); }),
      getJobSchedulers: vi.fn(async () => [{ key: 'old-scheduler', id: null }]),
      removeJobScheduler: vi.fn(async () => true),
      upsertJobScheduler: vi.fn(),
    };

    await expect(replaceLegacyRepeatablesWithScheduler(
      queue,
      ['old-tick'],
      ['old-scheduler'],
      'scheduler-id',
      { pattern: '*/15 * * * *' },
      { name: 'cron-meta-sync-ad-account-data', data: {} },
    )).rejects.toThrow('redis unavailable');
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });
});
