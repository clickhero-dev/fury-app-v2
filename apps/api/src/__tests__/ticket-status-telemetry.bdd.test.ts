/** Funcionalidade: diagnóstico seguro
 * Dado uma falha do provedor, quando consulta status,
 * então registra causa, ambiente e correlação sem credenciais e retorna erro seguro.
 */
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../lib/analytics.js', () => ({ captureServerEvent: vi.fn() }));
import { captureServerEvent } from '../lib/analytics.js';
import { TicketService } from '../services/tickets/ticket.service.js';
import { ClickUpTicketsError } from '../lib/clickup-tickets.client.js';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it.each([['CLICKUP_RATE_LIMITED', 'rate_limited'], ['CLICKUP_TIMEOUT', 'timeout'], ['CLICKUP_UNAUTHORIZED', 'unauthorized'], ['CLICKUP_INVALID_RESPONSE', 'invalid_response'], ['CLICKUP_NETWORK_ERROR', 'network_error']] as const)('registra %s com correlação segura', async (code, reason) => {
  vi.stubEnv('APP_ENV', 'hmg');
  const service = new TicketService({ listStatuses: vi.fn().mockRejectedValue(new ClickUpTicketsError(502, code, 'credential-secret', undefined, 429)) } as any);
  await expect(service.listStatuses('req-123')).rejects.toMatchObject({ code: 'TICKET_PROVIDER_UNAVAILABLE', details: { requestId: 'req-123' } });
  expect(captureServerEvent).toHaveBeenCalledWith('ticket_clickup_statuses_failed', expect.objectContaining({ reason, environment: 'hmg', requestId: 'req-123', providerStatus: 429 }));
  expect(JSON.stringify(vi.mocked(captureServerEvent).mock.calls)).not.toContain('credential-secret');
});
