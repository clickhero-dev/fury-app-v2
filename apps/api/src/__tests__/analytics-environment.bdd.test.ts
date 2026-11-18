/* Funcionalidade: distinguir ambientes no monitoramento backend.
 * Dado uma implantação identificada, quando ocorre erro, então envia environment.
 * Dado configuração ausente, então usa fallback explícito sem inferir produção. */
import { afterEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.hoisted(() => vi.fn());
vi.mock('posthog-node', () => ({ PostHog: class { captureException = captureException; } }));

describe('ambiente nas exceções backend', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });
  it.each([
    ['hmg', 'production', 'hmg'],
    ['production', 'production', 'production'],
    [undefined, 'development', 'development'],
    ['', 'test', 'test'],
    ['   ', 'test', 'test'],
    [' hmg ', 'production', 'hmg'],
    [undefined, undefined, 'unknown'],
  ])('Dado APP_ENV=%s e NODE_ENV=%s, então identifica %s', async (appEnv, nodeEnv, expected) => {
    vi.stubEnv('POSTHOG_API_KEY', 'phc_test');
    if (appEnv === undefined) delete process.env.APP_ENV;
    else vi.stubEnv('APP_ENV', appEnv);
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else vi.stubEnv('NODE_ENV', nodeEnv);
    const { captureServerException } = await import('../lib/analytics.js');
    captureServerException(new Error('failed access_token=secret'), { method: 'PUT', path: '/api/studio/assets/test/rating', statusCode: 500 });
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), 'server', expect.objectContaining({ environment: expected, source: 'server', statusCode: 500 }));
    expect(captureException.mock.calls[0][0].message).not.toContain('secret');
  });
  it('Dado telemetria desabilitada, então não envia exceções', async () => {
    vi.stubEnv('POSTHOG_API_KEY', '');
    const { captureServerException } = await import('../lib/analytics.js');
    captureServerException(new Error('failed'));
    expect(captureException).not.toHaveBeenCalled();
  });
});
