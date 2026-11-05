import { Router, type Request, type Response, type NextFunction } from 'express';
import { authMiddleware, authSSEMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { registerSSEClient } from '../lib/sse.js';
import { controllers } from '../di.js';

const router = Router();

// SSE transport (sem lógica de negócio).
router.get('/live-feed', authSSEMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    registerSSEClient(tenantId, res);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 30000);

    res.on('close', () => clearInterval(heartbeat));
  } catch (error) {
    next(error);
  }
});

router.use(authMiddleware, tenantMiddleware);

router.get('/config', controllers.fury.getConfig);
router.patch('/config', controllers.fury.patchConfig);
router.get('/rules', controllers.fury.listRules);
router.post('/rules', controllers.fury.createRule);
router.patch('/rules/:id', controllers.fury.updateRule);
router.delete('/rules/:id', controllers.fury.deleteRule);
router.get('/scores', controllers.fury.listScores);
router.get('/history', controllers.fury.listHistory);

export default router;