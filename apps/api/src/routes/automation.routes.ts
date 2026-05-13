import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db, furyInsights } from '@fury/db';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { registerSSEClient } from '../lib/sse.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/takedowns', async (req, res, next) => {
  try {
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      return res.status(401).json({
        error: 'Tenant não identificado',
      });
    }

    const takedowns = await db
      .select()
      .from(furyInsights)
      .where(eq(furyInsights.suggestionType, 'smart_takedown'))
      .orderBy(desc(furyInsights.createdAt))
      .limit(20);

    return res.json({
      data: takedowns,
    });
  } catch (error) {
    next(error);
  }
});
router.get('/feed', (req, res) => {
    const tenantId = req.tenant?.tenantId;
  
    if (!tenantId) {
      return res.status(401).json({
        error: 'Tenant não identificado',
      });
    }
  
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  
    res.write('event: connected\n');
    res.write(`data: ${JSON.stringify({ ok: true })}\n\n`);
  
    registerSSEClient(tenantId, res);
  });

export default router;