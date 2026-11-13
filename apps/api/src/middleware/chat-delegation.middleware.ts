import type { Request, Response, NextFunction } from 'express';
import { verifyChatDelegation, isChatToolPath } from '../lib/chat-delegation.js';
import { AppError } from './errorHandler.js';
import { ChatApprovalRepository } from '../repository/chat-approval.repository.js';
import type { ChatApprovalPort } from '../services/core/chat-approval.service.js';

type User = NonNullable<Request['user']>;
const identities = new WeakMap<Request, User>();
export function getDelegatedUser(req: Request): User | undefined { return identities.get(req); }

export function createDelegationGuard(options: { secret: string; repository: (tenantId: string) => ChatApprovalPort }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token || !options.secret) return next();
    let claims;
    try { claims = verifyChatDelegation(token, options.secret); }
    catch { return next(); }
    const path = req.originalUrl.split('?')[0];
    // Private media is request-bound processing/cleanup, not an external business action.
    // Exact method/path pairs only; delegated callers cannot upload, transcribe or download bytes.
    const mediaRead = req.method === 'POST' && /^\/api\/chat\/conversations\/[0-9a-f-]{36}\/attachments\/read\/?$/i.test(path);
    const mediaCleanup = req.method === 'DELETE' && /^\/api\/chat\/conversations\/[0-9a-f-]{36}\/attachments\/?$/i.test(path);
    if (mediaRead || mediaCleanup) {
      identities.set(req, { userId: claims.userId, tenantId: claims.tenantId, role: claims.role, email: claims.email });
      return next();
    }
    if (!isChatToolPath(path) || !['GET', 'HEAD', 'POST', 'PATCH'].includes(req.method)) {
      return next(new AppError(403, 'CHAT_SCOPE_DENIED', 'Ação não permitida'));
    }
    if (path.replace(/\/$/, '') === '/api/brand-kit' && !['GET', 'HEAD'].includes(req.method)) {
      return next(new AppError(403, 'CHAT_SCOPE_DENIED', 'Ação não permitida'));
    }
    // Mutations of existing resources require an endpoint with an atomic version check.
    const creation = /^\/api\/(?:studio\/ai\/(?:generate-image|chat-edit)|studio\/video\/jobs|planner\/posts|campaigns\/(?:create|create-wizard))\/?$/.test(path);
    const versionedCancel = /^\/api\/planner\/posts\/[a-zA-Z0-9-]+\/chat-cancel\/?$/.test(path);
    const versionedBrand = /^\/api\/brand-kit\/chat-update\/?$/.test(path);
    const versionedVideo = /^\/api\/studio\/video\/assets\/[a-zA-Z0-9-]+\/chat-adjust\/?$/.test(path);
    const createAd = /^\/api\/campaigns\/[a-zA-Z0-9-]+\/chat-ads-create\/?$/.test(path);
    const checkedCampaign = /^\/api\/campaigns\/[a-zA-Z0-9-]+\/(?:chat-update|chat-ads\/\d{1,32})\/?$/.test(path);
    const checkedProfile = /^\/api\/auth\/me\/chat-update\/?$/.test(path);
    if (!['GET', 'HEAD'].includes(req.method) && !(req.method === 'POST' && (creation || versionedVideo || createAd)) && !(req.method === 'PATCH' && (versionedCancel || versionedBrand || checkedCampaign || checkedProfile))) {
      return next(new AppError(403, 'CHAT_SCOPE_DENIED', 'Ação não permitida'));
    }
    const user: User = { userId: claims.userId, tenantId: claims.tenantId, role: claims.role, email: claims.email };
    if (!['GET', 'HEAD'].includes(req.method)) {
      const approvalId = req.get('X-Chat-Approval-Id') ?? '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(approvalId)) {
        return next(new AppError(403, 'CHAT_APPROVAL_REQUIRED', 'Aprovação necessária'));
      }
      try {
        const repository = options.repository(user.tenantId);
        const consumed = await repository.consume({ ...user, approvalId, method: req.method, path, body: req.body ?? {} });
        if (!consumed) return next(new AppError(403, 'CHAT_APPROVAL_REQUIRED', 'Aprovação inválida ou expirada'));
        const recoverableJob = /^\/api\/studio\/video\/(?:jobs|assets\/[a-zA-Z0-9-]+\/chat-adjust)\/?$/.test(path);
        const markUnknown = () => {
          if (!recoverableJob && repository.unknown) {
            void repository.unknown(approvalId, user.userId).catch(() => console.error('[chat] falha ao registrar resultado desconhecido'));
          }
        };
        const markComplete = () => {
          if (repository.complete) {
            void repository.complete(approvalId, user.userId).catch(() => console.error('[chat] falha ao concluir aprovação'));
          }
        };
        // The operation may finish after the client disconnects. In that case
        // Express never emits finish, but a controller's successful JSON response
        // still proves that the operation returned successfully.
        const originalJson = res.json.bind(res);
        res.json = (body) => {
          if (res.statusCode < 400) markComplete();
          return originalJson(body);
        };
        res.once('finish', () => {
          if (res.statusCode < 400) {
            markComplete();
          } else if (res.statusCode >= 400 && res.statusCode < 500 && repository.fail) {
            void repository.fail(approvalId, user.userId).catch(() => console.error('[chat] falha ao registrar erro da aprovação'));
          } else if (res.statusCode >= 500) {
            markUnknown();
          }
        });
        res.once('close', () => { if (!res.writableFinished) markUnknown(); });
      } catch {
        return next(new AppError(503, 'CHAT_APPROVAL_UNAVAILABLE', 'Não foi possível verificar a aprovação'));
      }
    }
    identities.set(req, user);
    next();
  };
}
export const chatDelegationGuard = createDelegationGuard({
  secret: process.env.CHAT_DELEGATION_SECRET ?? '',
  repository: tenantId => new ChatApprovalRepository(tenantId),
});
