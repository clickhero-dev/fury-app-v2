import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { controllers } from '../di.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

// Estado completo (conteúdo + aceite) da versão vigente para o usuário logado
router.get('/current', controllers.policy.getCurrent);
// Registra o aceite do usuário na versão vigente (idempotente)
router.post('/accept', controllers.policy.accept);

export default router;
