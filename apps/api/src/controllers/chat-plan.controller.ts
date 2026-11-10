import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { getDelegatedUser } from '../middleware/chat-delegation.middleware.js';
import { getChatPlanActor } from '../services/chat/chat-plan.identity.js';
import type { ChatPlanService } from '../services/chat/chat-plan.service.js';
import { patchPlanSchema, versionSchema, type PlanAction, type PlanScope } from '../services/chat/chat-plan.domain.js';
const params = z.object({ conversationId: z.string().uuid(), planId: z.string().uuid().optional(), taskId: z.string().uuid().optional() });
export class ChatPlanController {
    constructor(private readonly service: ChatPlanService) {
    }
    private context(req: Request) {
        const p = params.parse(req.params);
        if (!req.user)
            throw new AppError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
        if (!req.user.tenantId || (req.tenant && req.tenant.tenantId !== req.user.tenantId))
            throw new AppError(403, 'FORBIDDEN', 'Conta inválida.');
        return { scope: { tenantId: req.user.tenantId, userId: req.user.userId, conversationId: p.conversationId } satisfies PlanScope, ...p };
    }
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { scope } = this.context(req);
            res.json({ plans: await this.service.list(scope) });
        }
        catch (e) {
            next(e);
        }
    };
    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { scope } = this.context(req);
            res.status(201).json({ plan: await this.service.create(scope, req.body) });
        }
        catch (e) {
            next(e);
        }
    };
    get = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { scope, planId } = this.context(req);
            res.json({ plan: await this.service.get(scope, planId!) });
        }
        catch (e) {
            next(e);
        }
    };
    edit = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { scope, planId } = this.context(req);
            const { version, ...patch } = patchPlanSchema.parse(req.body);
            res.json({ plan: await this.service.edit(scope, planId!, version, patch) });
        }
        catch (e) {
            next(e);
        }
    };
    action = (action: PlanAction) => async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { scope, planId, taskId } = this.context(req);
            const { version } = versionSchema.parse(req.body);
            const actor = getDelegatedUser(req) ? 'chatbot' : getChatPlanActor(req);
            res.json({ plan: await this.service.action(scope, planId!, version, action, actor, taskId) });
        }
        catch (e) {
            next(e);
        }
    };
}
