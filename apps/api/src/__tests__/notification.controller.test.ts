/*
Funcionalidade: API de notificações in-app
Cenário: aplicar autorização e isolamento
Dado um usuário autenticado
Quando ele consulta ou cria notificações
Então somente seu tenant/role autorizada é aceita e entradas inválidas são rejeitadas
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationController } from '../controllers/notification.controller.js';

vi.mock('../lib/notification-rate-limit.js', () => ({ assertNotificationRateLimit: vi.fn().mockResolvedValue(undefined) }));
const response = () => { const r: any = {}; r.status = vi.fn().mockReturnValue(r); r.json = vi.fn().mockReturnValue(r); return r; };
const service = () => ({ list: vi.fn().mockResolvedValue([]), unreadCount: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ created: true, item: { id: 'n1', type: 'general', title: 'T', body: 'B', createdAt: new Date(), readAt: null } }), markRead: vi.fn(), markAllRead: vi.fn() });

describe('NotificationController', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns 401 when listing without authentication', async () => { const next = vi.fn(); await new NotificationController(service() as any).list({} as any, response(), next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 })); });
  it('returns 403 when a member tries to create', async () => { const next = vi.fn(); const req = { user: { userId: 'u1', role: 'member' }, tenant: { tenantId: 't1' }, body: { recipientUserId: '00000000-0000-0000-0000-000000000001', type: 'general', title: 'T', body: 'B' }, header: vi.fn() }; await new NotificationController(service() as any).create(req as any, response(), next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 })); });
  it('returns 400 for malformed payload before creating', async () => { const next = vi.fn(); const s = service(); const req = { user: { userId: 'u1', role: 'admin' }, tenant: { tenantId: 't1' }, body: { recipientUserId: 'not-uuid', type: 'general', title: '', body: 'B' }, header: vi.fn() }; await new NotificationController(s as any).create(req as any, response(), next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' })); expect(s.create).not.toHaveBeenCalled(); });
  it('returns 404 when another user marks an unknown notification', async () => { const next = vi.fn(); const s = service(); s.markRead.mockResolvedValue(null); const req = { user: { userId: 'u1' }, tenant: { tenantId: 't1' }, params: { id: '00000000-0000-0000-0000-000000000001' } }; await new NotificationController(s as any).read(req as any, response(), next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 })); });
});
