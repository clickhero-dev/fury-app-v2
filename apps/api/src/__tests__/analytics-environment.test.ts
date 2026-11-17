/* # Language: pt-BR
Funcionalidade: correlacionar exceções ao ambiente sem configuração sensível
  Cenário: ambiente explícito tem precedência e possui fallback seguro
    Dado um backend em HMG ou sem configuração explícita
    Quando captura uma exceção
    Então envia somente o nome do ambiente como contexto adicional
*/
import { afterEach, expect, it, vi } from 'vitest';
const captureException = vi.hoisted(() => vi.fn());
vi.mock('posthog-node', () => ({ PostHog: class { captureException = captureException; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });
it.each([['hmg','production','hmg'], [undefined,'test','test'], [undefined,undefined,'unknown']])(
  'Cenário: ambiente %s com NODE_ENV %s resulta em %s', async (appEnv, nodeEnv, expected) => {
    vi.stubEnv('POSTHOG_API_KEY', 'test-key');
    vi.stubEnv('APP_ENV', appEnv);
    vi.stubEnv('NODE_ENV', nodeEnv);
    const { captureServerException } = await import('../lib/analytics.js');
    captureServerException(new Error('Conta demo indisponível'), { code: 'DEMO_UNAVAILABLE' });
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), 'server', expect.objectContaining({ environment: expected }));
    expect(JSON.stringify(captureException.mock.calls)).not.toContain('test-key');
  });
