import type { Request, RequestHandler } from 'express';
import { verifyAccessToken } from '../../lib/jwt.js';
import { verifyChatDelegation } from '../../lib/chat-delegation.js';
import { getDelegatedUser } from '../../middleware/chat-delegation.middleware.js';
import { AppError } from '../../middleware/errorHandler.js';
import type { PlanActor } from './chat-plan.domain.js';
const actors = new WeakMap<Request, PlanActor>();
export function getChatPlanActor(req: Request): PlanActor {
    const actor = actors.get(req);
    if (!actor)
        throw new AppError(401, 'UNAUTHORIZED', 'Identidade não verificada.');
    return actor;
}
/** Independent authentication, so mount the specific router before the legacy chat proxy/guard. */
export function chatPlanAuthentication(secret: string): RequestHandler {
    return (req, _res, next) => {
        const token = req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
        if (!token)
            return next(new AppError(401, 'UNAUTHORIZED', 'Autenticação necessária.'));
        try {
            let delegated = getDelegatedUser(req);
            if (!delegated && secret) {
                try {
                    delegated = verifyChatDelegation(token, secret);
                }
                catch { /* fall through to ordinary access token */
                }
            }
            if (delegated) {
                req.user = { userId: delegated.userId, tenantId: delegated.tenantId, email: delegated.email, role: delegated.role };
                actors.set(req, 'chatbot');
            }
            else {
                const user = verifyAccessToken(token);
                if (!user.userId || !user.tenantId)
                    throw new AppError(403, 'FORBIDDEN', 'Conta inválida.');
                if ((user as unknown as {
                    actor?: string;
                }).actor)
                    throw new AppError(403, 'FORBIDDEN', 'Identidade delegada inválida.');
                req.user = user;
                actors.set(req, 'human');
            }
            next();
        }
        catch (e) {
            next(e);
        }
    };
}
