import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { controllers } from '../di.js';
import { cacheMiddleware } from '../middleware/cache.middleware.js';

const router = Router();

// Public
router.get('/plans', controllers.billing.listPlans);

// Webhook (sem auth — validado pelo header de token no controller)
router.post('/webhook', controllers.billing.webhook);

// Protected (auth + tenant)
router.use(authMiddleware, tenantMiddleware);
router.post('/subscribe', controllers.billing.subscribe);
router.get('/subscription', cacheMiddleware({ ttl: 60 }), controllers.billing.getSubscription);
router.get('/invoices', controllers.billing.listInvoices);
router.delete('/subscription', controllers.billing.cancel);

export default router;