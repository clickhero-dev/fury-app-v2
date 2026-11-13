import { Router } from 'express';
import type { ChatPlanController } from '../controllers/chat-plan.controller.js';
import { chatPlanAuthentication } from '../services/chat/chat-plan.identity.js';
/** Mount at /api/chat BEFORE the legacy delegation guard/proxy. Own auth + current access checks are mandatory. */
export function createChatPlanRouter(controller: ChatPlanController, options: {
    delegationSecret: string;
}): Router {
    const router = Router();
    const base = '/conversations/:conversationId/plans';
    const auth = chatPlanAuthentication(options.delegationSecret);
    router.get(base, auth, controller.list);
    router.post(base, auth, controller.create);
    router.get(`${base}/:planId`, auth, controller.get);
    router.patch(`${base}/:planId`, auth, controller.edit);
    for (const action of ['approve', 'pause', 'resume', 'cancel'] as const)
        router.post(`${base}/:planId/${action}`, auth, controller.action(action));
    router.post(`${base}/:planId/tasks/:taskId/complete`, auth, controller.action('complete'));
    return router;
}
