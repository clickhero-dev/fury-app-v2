import { Router } from 'express';
import { getApiState } from '../lib/api-state.js';

const router = Router();

router.get('/', (_req, res) => {
  const state = getApiState();
  res.json({
    status: state.status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: state.checks,
    startedAt: state.startedAt,
    healthyAt: state.healthyAt,
  });
});

export default router;