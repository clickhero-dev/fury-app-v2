import { Router } from 'express';
import { HealthCheckResponse } from '@fury/shared';

const router = Router();

router.get('/', (_req, res) => {
  const response: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  res.json(response);
});

export default router;