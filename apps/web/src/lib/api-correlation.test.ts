/* Dado 503 do backend, quando reportar no browser, então usa o requestId da mesma resposta. */
import { describe, expect, it, vi } from 'vitest';
vi.mock('./posthog', () => ({ captureException: vi.fn() }));
import { captureException } from './posthog';
import api from './api';
describe('BDD: correlação browser/backend', () => {
  it('Cenário: 503 → mantém identificador sem repetir chamada', async () => {
    const error = { config: { method: 'post', url: '/campaigns/suggest-text' }, response: { status: 503, headers: { 'x-request-id': 'request-123' }, data: { error: { code: 'AD_COPY_SUGGESTION_UNAVAILABLE' } } } };
    const adapter = vi.fn().mockRejectedValue(error);
    await expect(api.post('/campaigns/suggest-text', {}, { adapter })).rejects.toBe(error);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error, expect.objectContaining({ requestId: 'request-123', status: 503 }));
  });
});
