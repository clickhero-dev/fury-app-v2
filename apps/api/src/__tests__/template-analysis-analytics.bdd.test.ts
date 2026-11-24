import { afterEach, describe, expect, it, vi } from 'vitest';
const client = vi.hoisted(() => ({ capture: vi.fn(), captureException: vi.fn() }));
vi.mock('posthog-node', () => ({ PostHog: class { capture = client.capture; captureException = client.captureException; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });
describe('Dado monitoramento server-side', () => {
  it('Quando emite evento e exceção, então ambos contêm o ambiente explícito', async () => {
    vi.stubEnv('POSTHOG_API_KEY', 'test');
    vi.stubEnv('APP_ENV', 'hmg');
    const analytics = await import('../lib/analytics.js');
    analytics.captureServerEvent('studio_template_analysis', { outcome: 'failed' });
    analytics.captureServerException(new Error('safe'), { code: 'TEMPLATE_ANALYSIS_INVALID' });
    expect(client.capture).toHaveBeenCalledWith(expect.objectContaining({ properties: expect.objectContaining({ environment: 'hmg' }) }));
    expect(client.captureException).toHaveBeenCalledWith(expect.any(Error), 'server', expect.objectContaining({ environment: 'hmg' }));
  });
});
