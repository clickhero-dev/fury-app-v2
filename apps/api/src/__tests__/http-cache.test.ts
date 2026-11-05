import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedis } = vi.hoisted(() => ({
  mockRedis: { scan: vi.fn(), del: vi.fn() },
}));

vi.mock('../lib/redis.js', () => ({ getRedis: () => mockRedis }));

import { invalidateHttpCache } from '../lib/http-cache.js';

describe('invalidateHttpCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('escaneia por prefixo, itera o cursor e deleta as chaves', async () => {
    mockRedis.scan
      .mockResolvedValueOnce([
        '42',
        ['cache:http:t1:GET:/api/metrics/campaigns?x', 'cache:http:t1:GET:/api/metrics/summary'],
      ])
      .mockResolvedValueOnce(['0', ['cache:http:t1:GET:/api/metrics/daily']]);
    mockRedis.del.mockResolvedValue(3);

    await invalidateHttpCache('t1', ['/api/metrics']);

    expect(mockRedis.scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      'cache:http:t1:GET:/api/metrics*',
      'COUNT',
      500
    );
    expect(mockRedis.scan).toHaveBeenCalledTimes(2); // seguiu o cursor 42
    expect(mockRedis.del).toHaveBeenCalledTimes(2); // 1 del por batch (não acumula)
    expect(mockRedis.del).toHaveBeenNthCalledWith(
      1,
      'cache:http:t1:GET:/api/metrics/campaigns?x',
      'cache:http:t1:GET:/api/metrics/summary'
    );
    expect(mockRedis.del).toHaveBeenNthCalledWith(2, 'cache:http:t1:GET:/api/metrics/daily');
  });

  it('múltiplos prefixes → um scan por prefixo', async () => {
    mockRedis.scan.mockResolvedValue(['0', []]);
    await invalidateHttpCache('t1', ['/api/metrics/goals-progress', '/api/goals/progress']);

    expect(mockRedis.scan).toHaveBeenCalledTimes(2);
    expect(mockRedis.scan).toHaveBeenCalledWith('0', 'MATCH', 'cache:http:t1:GET:/api/metrics/goals-progress*', 'COUNT', 500);
    expect(mockRedis.scan).toHaveBeenCalledWith('0', 'MATCH', 'cache:http:t1:GET:/api/goals/progress*', 'COUNT', 500);
  });

  it('nenhuma chave → não chama del', async () => {
    mockRedis.scan.mockResolvedValue(['0', []]);
    await invalidateHttpCache('t1', ['/api/metrics']);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('erro do redis loga e não lança (invalidação é best-effort)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRedis.scan.mockRejectedValue(new Error('redis down'));

    await expect(invalidateHttpCache('t1', ['/api/metrics'])).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
