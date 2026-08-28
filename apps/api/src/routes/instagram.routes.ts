import { Router } from 'express';
import { controllers } from '../di.js';

const router = Router();

router.get('/posts-ranked', controllers.instagram.getPostsRanked);
router.get('/media-proxy', controllers.instagram.mediaProxy);

export default router;