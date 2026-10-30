import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { controllers } from '../di.js';
import { registerSSEUserClient } from '../lib/sse.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);
router.get('/stream', (req: Request, res: Response, next) => {
  try {
    const { tenantId } = req.tenant!; const userId = req.user!.userId;
    if (!registerSSEUserClient(tenantId, userId, res)) throw new AppError(429, 'SSE_CONNECTION_LIMIT', 'Limite de conexões atingido');
    res.setHeader('X-Accel-Buffering', 'no'); res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache, no-transform'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders();
    const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 30000); res.on('close', () => clearInterval(heartbeat));
  } catch (e) { next(e); }
});
router.post('/read-all', controllers.notification.readAll);
router.get('/', controllers.notification.list);
router.post('/', controllers.notification.create);
router.patch('/:id/read', controllers.notification.read);
export default router;
