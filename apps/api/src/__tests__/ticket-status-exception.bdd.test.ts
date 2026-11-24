/** Dado indisponibilidade do ClickUp, quando o middleware registra a exceção,
 * então evento e exceção compartilham ambiente e correlação, sem vazar a causa bruta. */
import { expect, it, vi } from 'vitest';
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn(), captureServerEvent: vi.fn() }));
import { captureServerException, captureServerEvent } from '../lib/analytics.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { TicketService } from '../services/tickets/ticket.service.js';
import { TicketsController } from '../controllers/tickets.controller.js';
import { ClickUpTicketsError } from '../lib/clickup-tickets.client.js';
it('correlaciona controller, serviço e exceção com o ID dos logs', async () => {
  const service = new TicketService({ listStatuses: vi.fn().mockRejectedValue(new ClickUpTicketsError(502, 'CLICKUP_UNAUTHORIZED', 'secret-token', undefined, 401)) } as any);
  const next = vi.fn();
  const res = { getHeader: () => 'req-logs-123', status: vi.fn().mockReturnThis(), json: vi.fn() };
  await new TicketsController(service).listStatuses({} as any, res as any, next);
  const error = next.mock.calls[0][0];
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    errorHandler(error, { method: 'GET', originalUrl: '/api/admin/tickets/statuses' } as any, res as any, vi.fn());
    expect(captureServerException).toHaveBeenCalledWith(error, expect.objectContaining({ requestId: 'req-logs-123', reason: 'unauthorized', providerStatus: 401, environment: process.env.APP_ENV || 'unknown' }));
    expect(captureServerEvent).toHaveBeenCalledWith('ticket_clickup_statuses_failed', expect.objectContaining({ requestId: 'req-logs-123' }));
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: { code: 'TICKET_PROVIDER_UNAVAILABLE', message: 'Não foi possível carregar os status agora. Tente novamente.', details: { requestId: 'req-logs-123' } } }));
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret-token');
  } finally { log.mockRestore(); }
});
