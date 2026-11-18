import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { AppError } from '../middleware/errorHandler.js';
import type { ChatReadCapabilities } from '../services/chat/chat-read-capabilities.js';
import { rbacService, type RbacService } from '../services/core/rbac.service.js';

type ChatReadServiceFactory = (role: string) => Pick<ChatReadCapabilities, 'quota' | 'meta'>;

export function createChatReadRouter(createService: ChatReadServiceFactory, rbac: Pick<RbacService, 'checkServices'> = rbacService) {
  const router = Router();
  for (const [path, operation] of [['/studio/chat-quotas', 'quota'], ['/meta/chat-ads-diagnostic', 'meta']] as const) {
    router.get(path, authMiddleware, tenantMiddleware, async (req, res, next) => {
      if (Object.keys(req.query).length) return next(new AppError(400, 'INVALID_QUERY', 'Parâmetros não são permitidos.'));
      let allowed: {images: boolean; videos: boolean} | undefined;
      if (operation === 'quota') {
        try {
          const [images, videos] = await Promise.all([
            rbac.checkServices(req.user!.userId, ['studio', 'studio.image']),
            rbac.checkServices(req.user!.userId, ['studio', 'studio.video']),
          ]);
          if (images === 'unknown_user' || videos === 'unknown_user') return next(new AppError(401, 'UNAUTHORIZED', 'Usuário não encontrado'));
          allowed = {images: images === 'allowed', videos: videos === 'allowed'};
          if (!allowed.images && !allowed.videos) return next(new AppError(403, 'SERVICE_BLOCKED', 'Recurso não disponível para sua conta'));
        } catch {
          return next(new AppError(503, 'RBAC_UNAVAILABLE', 'Não foi possível verificar permissões'));
        }
      }
      try {
        const service = createService(req.user!.role);
        const data = operation === 'quota'
          ? await service.quota(req.tenant!.tenantId, allowed)
          : await service.meta(req.tenant!.tenantId);
        res.set('Cache-Control', 'no-store').json({success:true, data});
      } catch {
        next(new AppError(500, 'CHAT_READ_FAILED', 'Não foi possível consultar os dados.'));
      }
    });
  }
  return router;
}
