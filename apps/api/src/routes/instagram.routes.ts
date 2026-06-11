import { Router } from 'express';
import { getPostsRankedHandler, mediaProxyHandler } from '../controllers/instagram.controller.js';

const router = Router();

router.get('/posts-ranked', getPostsRankedHandler);
router.get('/media-proxy', mediaProxyHandler);

export default router;
