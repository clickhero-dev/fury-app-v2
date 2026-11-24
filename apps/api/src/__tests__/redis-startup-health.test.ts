import { describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ ready: vi.fn(), check: vi.fn() }));
vi.mock('../lib/redis.js', () => ({ waitForRedisReady: mocks.ready }));
vi.mock('../lib/api-state.js', () => ({ setCheck: mocks.check, setStatus: vi.fn(), handleCriticalFailure: vi.fn(), getMissingEnvs: vi.fn() }));
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('@fury/db/migrate', () => ({ runMigrationsAndValidate: vi.fn() }));
import { apiStartupWorkflow } from '../workflows/api-startup.workflow.js';
describe('Saúde do Redis no startup', () => {
  it('registra falha sanitizada e atualiza o check após recuperação', async () => {
    const stage = apiStartupWorkflow.stages.find((entry) => entry.id === 'redis-connect')!;
    mocks.ready.mockRejectedValueOnce(new Error('REDIS_CONNECTION_TIMEOUT')).mockResolvedValueOnce(undefined);
    await expect(stage.execute({ startedAt: '' }, {})).rejects.toThrow('REDIS_CONNECTION_TIMEOUT');
    expect(mocks.check).toHaveBeenCalledWith('redis', false, 'REDIS_CONNECTION_TIMEOUT');
    await stage.execute({ startedAt: '' }, {});
    expect(mocks.check).toHaveBeenLastCalledWith('redis', true, expect.stringMatching(/^latency/));
  });
});
