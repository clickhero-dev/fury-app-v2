import { Router } from 'express';
import { getPostsRankedHandler } from '../controllers/instagram.controller.js';

const router = Router();

router.get('/posts-ranked', getPostsRankedHandler);

export default router;
