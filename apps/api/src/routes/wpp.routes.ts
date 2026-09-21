import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { checkSubscriptionActive } from '../middleware/checkSubscriptionActive.js';
import { controllers } from '../di.js';

const router = Router();

// Webhook uazapi — PÚBLICO (sem auth por enquanto; decisão na issue #207).
// A uazapi envia POST JSON para esta URL; respondemos 200 imediatamente.
router.post('/webhook', controllers.wppWebhook.handle);

// Verificação de número — auth + tenant (usuário logado em Configurações).
const AUTH_TENANT_SUB = [authMiddleware, tenantMiddleware, checkSubscriptionActive];
router.post('/verify/start', ...AUTH_TENANT_SUB, controllers.wppVerify.start);
router.post('/verify/confirm', ...AUTH_TENANT_SUB, controllers.wppVerify.confirm);
router.get('/verify/status', ...AUTH_TENANT_SUB, controllers.wppVerify.status);

export default router;
