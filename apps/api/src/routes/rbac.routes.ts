import { Router, type Request, type Response, type NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { AppError } from '../middleware/errorHandler.js';
import { rbacService } from '../services/core/rbac.service.js';

// Telas bloqueadas do usuário logado — o front busca uma vez no login
const router = Router();
router.use(authMiddleware);

router.get('/blocked-views', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const blocked = user.role === 'mock' ? [] : await rbacService.listBlockedViews(user.userId);
    if (blocked === null) throw new AppError(401, 'UNAUTHORIZED', 'Usuário não encontrado');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { blocked } });
  } catch (e) {
    next(e);
  }
});

export default router;
