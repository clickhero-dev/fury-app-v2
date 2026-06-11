import { Router } from 'express';
import { getInstagramInsightsHandler } from '../controllers/dashboard.controller.js';

const router = Router();

router.get('/instagram-insights', getInstagramInsightsHandler);

export default router;
