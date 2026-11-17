/* Dado requests concorrentes em ambientes distintos, quando capturar exceções,
 então mantém correlação e ambiente sem misturar contextos. */
import { afterEach, describe, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => vi.fn());
vi.mock('posthog-node', () => ({ PostHog: class { captureException = capture; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); capture.mockClear(); });
describe('BDD: correlação backend', () => {
  it('Cenário: exceção backend → ambiente explícito e requestId isolado', async () => {
    vi.stubEnv('POSTHOG_API_KEY', 'test'); vi.stubEnv('APP_ENV', 'hmg');
    const { captureServerException } = await import('../lib/analytics.js');
    const { requestContext } = await import('../lib/request-context.js');
    await Promise.all(['req-1', 'req-2'].map(requestId => requestContext.run({ requestId, path: '/planner/posts/suggest-caption' }, async () => {
      await Promise.resolve(); captureServerException(new Error('safe'), { code: requestId });
    })));
    for (const id of ['req-1', 'req-2']) expect(capture).toHaveBeenCalledWith(expect.any(Error), 'server', expect.objectContaining({ environment: 'hmg', requestId: id, errorCode: id }));
  });
  it('Cenário: ambiente não configurado → não presumir produção', async () => {
    vi.stubEnv('APP_ENV', ''); vi.stubEnv('DEPLOYMENT_ENV', ''); vi.stubEnv('NODE_ENV', '');
    const { analyticsEnvironment } = await import('../lib/request-context.js');
    expect(analyticsEnvironment()).toBe('unknown');
  });
});
