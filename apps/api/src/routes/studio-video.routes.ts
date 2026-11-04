import { Router } from 'express';
import { controllers } from '../di.js';

// auth + tenant + assinatura aplicados no routes/index.ts
const router = Router();

router.get('/options', controllers.studioVideo.getOptions);
router.post('/script', controllers.studioVideo.generateScript);
router.post('/jobs', controllers.studioVideo.createJob);
router.get('/jobs', controllers.studioVideo.listActiveJobs);
router.get('/jobs/:jobId', controllers.studioVideo.getJob);
router.post('/assets/:assetId/adjust', controllers.studioVideo.adjust);

export default router;
