import { Router, Request, Response } from 'express';
import { HealthCheckResponse } from '@fury/shared';

const router = Router();

router.get('/health', (req: Request, res: Response) => {
  const startTime = process.uptime ? process.uptime() : 0;
  const response: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: startTime,
  };
  res.json(response);
});

export default router;
