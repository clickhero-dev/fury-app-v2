import { Router } from 'express';
import { controllers } from '../di.js';

const router = Router();
router.post('/signup', controllers.publicTrial.signup);
router.post('/access', controllers.publicTrial.access);
export default router;
