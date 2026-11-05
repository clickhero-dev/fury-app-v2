import { Router } from 'express';
import { controllers } from '../di.js';

const router = Router();

router.post('/start', controllers.forms.start);
router.post('/complete', controllers.forms.complete);
router.post('/error', controllers.forms.error);
router.post('/abandoned', controllers.forms.abandoned);

export default router;