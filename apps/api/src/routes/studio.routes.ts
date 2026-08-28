import { Router } from 'express';
import fs from 'fs';
import { join } from 'path';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { studioAssetsDir } from '../lib/temp-storage.js';
import { controllers } from '../di.js';

const router = Router();

// Diagnóstico de storage (infra).
router.get('/storage-check', async (_req: any, res: any) => {
  const testFile = join(studioAssetsDir, 'test.txt');
  let writeOk = false;
  let error: string | null = null;
  try {
    if (!fs.existsSync(studioAssetsDir)) fs.mkdirSync(studioAssetsDir, { recursive: true });
    fs.writeFileSync(testFile, 'test');
    writeOk = fs.existsSync(testFile);
    fs.unlinkSync(testFile);
  } catch (err: any) {
    error = err.message;
  }
  res.json({
    studioAssetsDir,
    dirExists: fs.existsSync(studioAssetsDir),
    writeOk,
    error,
    files: fs.existsSync(studioAssetsDir) ? fs.readdirSync(studioAssetsDir).slice(0, 5) : [],
  });
});

// Assets + geração de imagem única (StudiopublishingController via DI).
router.get('/assets', authMiddleware, tenantMiddleware, controllers.studioPublishing.listAssets);
router.delete('/assets/:assetId', authMiddleware, tenantMiddleware, controllers.studioPublishing.deleteAsset);
router.get('/assets/:assetId', authMiddleware, tenantMiddleware, controllers.studioPublishing.getAsset);
router.get('/assets/:assetId/compliance-status', authMiddleware, tenantMiddleware, controllers.studioPublishing.getComplianceStatus);
router.post('/generate-image', authMiddleware, tenantMiddleware, controllers.studioPublishing.generateImage);
router.post('/render-creative', authMiddleware, tenantMiddleware, controllers.studioPublishing.renderCreative);
router.post('/publish/:assetId', authMiddleware, tenantMiddleware, controllers.studioPublishing.publishAsset);
router.post('/upload-to-meta', authMiddleware, tenantMiddleware, controllers.studioPublishing.uploadToMeta);

// Pipeline criativo (classe StudioService via DI).
router.post('/generate-copy', authMiddleware, tenantMiddleware, controllers.studio.generateCopy);
router.post('/copy/generate', authMiddleware, tenantMiddleware, controllers.studio.copyGenerate);
router.post('/creative/validate-context', authMiddleware, tenantMiddleware, controllers.studio.validateContext);
router.post('/creative/generate', authMiddleware, tenantMiddleware, controllers.studio.generateCreative);
router.post('/creative/regenerate', authMiddleware, tenantMiddleware, controllers.studio.regenerateCreative);
router.post('/select-layout', authMiddleware, tenantMiddleware, controllers.studio.selectLayout);
router.post('/preview-png', authMiddleware, tenantMiddleware, controllers.studio.previewPng);

export default router;