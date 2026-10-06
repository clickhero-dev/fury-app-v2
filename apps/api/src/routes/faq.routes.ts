import { Router } from 'express';
import { controllers } from '../di.js';

const router = Router();
router.get('/', controllers.faq.listPublic);
router.get('/:slug', controllers.faq.getPublicBySlug);
export default router;
