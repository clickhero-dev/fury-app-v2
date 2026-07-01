import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  createRuleEngineQueue,
  getStudioQueue,
  getStudioComplianceQueue,
  getFuryEngineQueue,
} from '../lib/queue.js';
import type { Queue } from 'bullmq';

/** Only owner and admin roles can access the BullMQ dashboard */
function adminMiddleware(req: any, _res: any, next: any) {
  const role = req.user?.role;
  if (role !== 'owner' && role !== 'admin') {
    return next(new AppError(403, 'FORBIDDEN', 'Admin access required'));
  }
  next();
}

export async function createBullBoardRouter(): Promise<Router> {
  const router = Router();

  // Auth on the whole /admin/queues subtree
  router.use(authMiddleware);
  router.use(adminMiddleware);

  // Resolve all queue instances (they're singleton factories, safe to call)
  const queues: Queue[] = [
    await createRuleEngineQueue(),
    await getStudioQueue(),
    await getStudioComplianceQueue(),
    await getFuryEngineQueue(),
  ];

  const adapter = new ExpressAdapter();
  adapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter: adapter,
  });

  router.use('/', adapter.getRouter());

  return router;
}
