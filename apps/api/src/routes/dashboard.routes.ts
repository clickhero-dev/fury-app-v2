import { Router } from 'express';
import { controllers } from '../di.js';

const router = Router();

router.get('/instagram-insights', controllers.dashboard.getInstagramInsightsHandler);

export default router;