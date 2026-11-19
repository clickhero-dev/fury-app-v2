import { createHash } from 'node:crypto';
import type { AccessTokenPayload } from '../../lib/jwt.js';
import type { PlanRepositoryFactory } from '../../repository/chat-plan.repository.js';
import { AppError } from '../../middleware/errorHandler.js';
import { changePlan, editPlan, newPlan, parsePlanInput, publicPlan, type ChatCapability, type PlanScope, type PlanActor, type PlanAction, type PlanInput } from './chat-plan.domain.js';
export interface PlanAccess {
    authorize(scope: PlanScope, capability?: ChatCapability): Promise<AccessTokenPayload>;
}
export interface PlanWake extends PlanScope {
    planId: string;
    version: number;
}
export interface PlanQueue {
    enqueue(wake: PlanWake, delayMs?: number): Promise<void>;
}
export class ChatPlanService {
    constructor(private readonly repo: PlanRepositoryFactory, private readonly queue: PlanQueue, private readonly access: PlanAccess) {
    }
    async create(scope: PlanScope, input: unknown, run?: { runId: string; leaseId: string; operationId: string }) {
        await this.access.authorize(scope);
        const parsed = parsePlanInput(input);
        const fence = run && { ...run, key: run.operationId, payloadHash: createHash('sha256').update(JSON.stringify(parsed)).digest('hex') };
        return publicPlan(await this.repo(scope.tenantId, scope.userId).create(newPlan(scope.conversationId, parsed), fence));
    }
    async get(scope: PlanScope, id: string) {
        await this.access.authorize(scope);
        return publicPlan(await this.repo(scope.tenantId, scope.userId).get(scope.conversationId, id));
    }
    async list(scope: PlanScope) {
        await this.access.authorize(scope);
        return (await this.repo(scope.tenantId, scope.userId).list(scope.conversationId)).map(publicPlan);
    }
    async edit(scope: PlanScope, id: string, version: number, patch: Partial<PlanInput>) {
        await this.access.authorize(scope);
        return publicPlan(await this.repo(scope.tenantId, scope.userId).mutate(scope.conversationId, id, version, p => editPlan(p, patch)));
    }
    async action(scope: PlanScope, id: string, version: number, action: PlanAction, actor: PlanActor, taskId?: string) {
        if (actor !== 'human')
            throw new AppError(403, 'CHAT_PLAN_HUMAN_REQUIRED', 'Esta ação exige sua confirmação pessoal.');
        await this.access.authorize(scope);
        const p = await this.repo(scope.tenantId, scope.userId).mutate(scope.conversationId, id, version, async (p, tx) => {
            changePlan(p, action, actor, taskId);
            if (action === 'cancel')
                for (const task of p.tasks) {
                    if (task.capability === 'manual' && task.status === 'waiting_approval')
                        task.status = 'cancelled';
                    if (task.approvalId && task.status === 'waiting_approval' && await tx.cancelPendingApproval(scope.conversationId, task.approvalId)) {
                        task.status = 'cancelled';
                        delete task.fence;
                        delete task.leaseUntil;
                    }
                }
        });
        if (['running', 'waiting_approval'].includes(p.status) || p.tasks.some(t => t.status === 'running' || (t.status === 'waiting_approval' && t.approvalId))) {
            try {
                await this.queue.enqueue({ ...scope, planId: p.id, version: p.version });
            }
            catch {
                throw new AppError(503, 'CHAT_PLAN_QUEUE_UNAVAILABLE', 'O estado foi salvo. A execução será recuperada; atualize a conversa antes de tentar novamente.');
            }
        }
        return publicPlan(p);
    }
}
