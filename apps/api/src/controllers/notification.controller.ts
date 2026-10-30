import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import type { NotificationService } from '../services/notifications/notification.service.js';
import { assertNotificationRateLimit } from '../lib/notification-rate-limit.js';

const id = z.string().uuid();
const createSchema = z.object({ recipientUserId: id, type: z.literal('general'), title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(500) }).strict();
const cursorSchema = z.object({ createdAt: z.string().datetime(), id }).strict();
const encodeCursor = (value: { createdAt: Date; id: string }) => Buffer.from(JSON.stringify({ createdAt: value.createdAt.toISOString(), id: value.id })).toString('base64url');
const decodeCursor = (raw: string | undefined) => {
  if (!raw) return undefined;
  try { return cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))); }
  catch { throw new AppError(400, 'INVALID_CURSOR', 'Cursor inválido'); }
};
const item = (row: any) => ({ id: row.id, type: row.type, title: row.title, body: row.body, createdAt: row.createdAt, readAt: row.readAt });

export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  private context(req: Request) { if (!req.user || !req.tenant) throw new AppError(401, 'UNAUTHORIZED', 'Não autenticado'); return { tenantId: req.tenant.tenantId, user: req.user }; }

  list = async (req: Request, res: Response, next: NextFunction) => { try {
    const { tenantId, user } = this.context(req); const limit = z.coerce.number().int().min(1).max(50).default(20).parse(req.query.limit); const cursor = decodeCursor(typeof req.query.cursor === 'string' ? req.query.cursor : undefined);
    const rows = await this.service.list(tenantId, user.userId, limit, cursor ? { createdAt: new Date(cursor.createdAt), id: cursor.id } : undefined); const hasMore = rows.length > limit; const page = hasMore ? rows.slice(0, limit) : rows;
    res.json({ success: true, data: { items: page.map(item), nextCursor: hasMore ? encodeCursor({ createdAt: page.at(-1)!.createdAt, id: page.at(-1)!.id }) : null, unreadCount: await this.service.unreadCount(tenantId, user.userId) } });
  } catch (e) { next(e); } };

  create = async (req: Request, res: Response, next: NextFunction) => { try {
    const { tenantId, user } = this.context(req); if (!['owner', 'admin'].includes(user.role)) throw new AppError(403, 'FORBIDDEN', 'Sem permissão para criar notificações');
    await assertNotificationRateLimit(tenantId, user.userId);
    const body = createSchema.parse(req.body); const key = req.header('Idempotency-Key'); if (key && !/^[\x21-\x7e]{1,128}$/.test(key)) throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'Chave de idempotência inválida');
    const result = await this.service.create({ ...body, tenantId, callerId: user.userId, idempotencyKey: key }); res.status(result.created ? 201 : 200).json({ success: true, data: item(result.item) });
  } catch (e) { next(e); } };

  read = async (req: Request, res: Response, next: NextFunction) => { try { const { tenantId, user } = this.context(req); const row = await this.service.markRead(tenantId, user.userId, id.parse(req.params.id)); if (!row) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notificação não encontrada'); res.json({ success: true, data: item(row) }); } catch (e) { next(e); } };
  readAll = async (req: Request, res: Response, next: NextFunction) => { try { const { tenantId, user } = this.context(req); res.json({ success: true, data: { updatedCount: await this.service.markAllRead(tenantId, user.userId) } }); } catch (e) { next(e); } };
}
