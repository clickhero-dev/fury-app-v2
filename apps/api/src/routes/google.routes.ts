import { Router } from 'express';

const router = Router();

router.get('/auth/test', (_req, res) => {
  res.json({ status: 'ok', message: 'google auth router is reachable', timestamp: new Date().toISOString() });
});

export default router;