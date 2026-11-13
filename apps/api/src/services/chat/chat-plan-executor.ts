import { chatPlanActionErrors, type ChatPlanActionErrorCode } from './chat-plan-errors.js';
import { randomUUID } from 'node:crypto';
import type { PlanRepositoryFactory, PlanProposal, ChatPlanStore } from '../../repository/chat-plan.repository.js';
import type { AccessTokenPayload } from '../../lib/jwt.js';
import { ready, settlePlan, type StoredPlan, type StoredTask, type PlanResult, type PlanScope } from './chat-plan.domain.js';
import type { PlanAccess, PlanQueue, PlanWake } from './chat-plan.service.js';
export type StepOutcome = {
    kind: 'completed';
    result: PlanResult;
} | {
    kind: 'proposal';
    proposal: PlanProposal;
} | {
    kind: 'waiting';
} | {
    kind: 'failed';
    unknown?: boolean;
    code?: ChatPlanActionErrorCode;
};
export interface PlanCapabilities {
    execute(scope: PlanScope, plan: StoredPlan, task: StoredTask, user: AccessTokenPayload): Promise<StepOutcome>;
    reconcile(scope: PlanScope, task: StoredTask, user: AccessTokenPayload, repo: ChatPlanStore): Promise<StepOutcome>;
}
export class PlanStepError extends Error {
    constructor(readonly reason: 'transient' | 'invalid' | 'partial' | 'unknown' | 'revoked' | 'video_not_in_plan' | 'video_quota') {
        super(reason === 'video_not_in_plan' ? 'Seu plano não inclui criação de vídeo.' : reason === 'video_quota' ? 'Sua cota de vídeos está esgotada neste período.' : 'Não foi possível verificar esta etapa.');
    }
}
const LEASE_MS = 120000, WAIT_MS = 60000, MAX_WAIT_MS = 25 * 3600000;
const unknownMessage = 'Não foi possível confirmar o resultado. Verifique a ação antes de tentar novamente.';
function replaySafe(t: StoredTask) {
    return t.capability.startsWith('read_') || t.capability.startsWith('propose_');
}
function fail(t: StoredTask, reason: StoredTask['failure']) {
    t.status = 'failed';
    t.failure = reason;
    t.error = reason === 'revoked' ? 'Seu acesso mudou. Verifique a conta antes de continuar.' : reason === 'unknown' ? unknownMessage : 'Não foi possível concluir esta etapa. Revise os dados e crie um plano revisado.';
    delete t.leaseUntil;
}
export class ChatPlanExecutor {
    constructor(private readonly repo: PlanRepositoryFactory, private readonly capabilities: PlanCapabilities, private readonly access: PlanAccess, private readonly queue: PlanQueue, private readonly now: () => number = Date.now) {
    }
    async run(wake: PlanWake): Promise<void> {
        const repo = this.repo(wake.tenantId, wake.userId);
        let claim: {
            task: StoredTask;
            plan: StoredPlan;
            reconcile: boolean;
        } | undefined;
        let p: StoredPlan;
        try {
            p = await repo.mutate(wake.conversationId, wake.planId, undefined, plan => {
                if (['draft', 'completed', 'failed'].includes(plan.status))
                    return;
                const active = plan.tasks.find(t => t.status === 'running' || (t.status === 'waiting_approval' && t.capability !== 'manual'));
                if (active) {
                    if (active.leaseUntil && Date.parse(active.leaseUntil) > this.now())
                        return;
                    if (active.status === 'running') {
                        if (!replaySafe(active) || active.attempts >= 2 || ['paused', 'cancelled'].includes(plan.status)) {
                            fail(active, 'unknown');
                            settlePlan(plan);
                            return;
                        }
                        active.status = 'pending';
                        delete active.fence;
                        delete active.leaseUntil;
                    }
                }
                const waiting = plan.tasks.find(t => t.status === 'waiting_approval' && t.approvalId);
                if (waiting) {
                    if (waiting.waitUntil && Date.parse(waiting.waitUntil) <= this.now()) {
                        fail(waiting, 'unknown');
                        settlePlan(plan);
                        return;
                    }
                    if (waiting.nextCheckAt && Date.parse(waiting.nextCheckAt) > this.now())
                        return;
                    waiting.fence = randomUUID();
                    waiting.leaseUntil = new Date(this.now() + LEASE_MS).toISOString();
                    claim = { task: structuredClone(waiting), plan: structuredClone(plan), reconcile: true };
                    return;
                }
                if (!['running', 'waiting_approval'].includes(plan.status))
                    return;
                // No second automatic step while a manual task is outstanding.
                if (plan.tasks.some(t => t.status === 'waiting_approval'))
                    return;
                const t = plan.tasks.find(t => t.status === 'pending' && ready(plan, t));
                if (!t) {
                    settlePlan(plan);
                    return;
                }
                if (t.nextCheckAt && Date.parse(t.nextCheckAt) > this.now())
                    return;
                if (t.capability === 'manual') {
                    t.status = 'waiting_approval';
                    settlePlan(plan);
                    return;
                }
                if (t.attempts >= 2) {
                    fail(t, 'permanent');
                    settlePlan(plan);
                    return;
                }
                t.attempts++;
                t.fence = randomUUID();
                t.status = 'running';
                t.leaseUntil = new Date(this.now() + LEASE_MS).toISOString();
                delete t.error;
                claim = { task: structuredClone(t), plan: structuredClone(plan), reconcile: false };
            });
        }
        catch (e) {
            if ((e as {
                statusCode?: number;
            }).statusCode === 404)
                return;
            throw e;
        }
        if (!claim)
            return;
        const c = claim;
        let outcome: StepOutcome;
        let failure: unknown;
        try {
            const user = await this.access.authorize(wake, c.task.capability);
            // Re-read the fence after permission checks. Pause/cancel must not launch a new call.
            const latest = await repo.get(wake.conversationId, wake.planId);
            const task = latest.tasks.find(t => t.id === c.task.id);
            if (task?.fence !== c.task.fence)
                return;
            if (!c.reconcile && ['paused', 'cancelled'].includes(latest.status)) {
                await repo.mutate(wake.conversationId, wake.planId, undefined, plan => {
                    const t = plan.tasks.find(t => t.id === c.task.id)!;
                    if (t.fence === c.task.fence) {
                        t.status = plan.status === 'cancelled' ? 'cancelled' : 'pending';
                        t.attempts--;
                        delete t.fence;
                        delete t.leaseUntil;
                    }
                });
                return;
            }
            outcome = c.reconcile ? await this.capabilities.reconcile(wake, c.task, user, repo) : await this.capabilities.execute(wake, c.plan, c.task, user);
        }
        catch (e) {
            failure = e;
            outcome = { kind: 'failed', unknown: true };
        }
        p = await repo.mutate(wake.conversationId, wake.planId, undefined, async (plan, tx) => {
            const t = plan.tasks.find(t => t.id === c.task.id);
            if (!t || t.fence !== c.task.fence)
                return;
            delete t.leaseUntil;
            if (failure) {
                const denied = (failure as {
                    statusCode?: number;
                }).statusCode === 403 || (failure as {
                    statusCode?: number;
                }).statusCode === 401 || (failure instanceof PlanStepError && failure.reason === 'revoked');
                if (denied)
                    fail(t, 'revoked');
                else if (failure instanceof PlanStepError && ['video_not_in_plan', 'video_quota'].includes(failure.reason)) {
                    fail(t, 'permanent');
                    t.error = failure.message;
                }
                else if (c.reconcile) {
                    t.status = 'waiting_approval';
                    t.nextCheckAt = new Date(this.now() + WAIT_MS).toISOString();
                }
                else if (failure instanceof PlanStepError && failure.reason === 'transient' && replaySafe(t) && t.attempts < 2) {
                    t.status = 'pending';
                    t.nextCheckAt = new Date(this.now() + 2000).toISOString();
                }
                else
                    fail(t, failure instanceof PlanStepError && ['invalid', 'partial', 'transient'].includes(failure.reason) ? 'permanent' : 'unknown');
            }
            else if (outcome.kind === 'completed') {
                if (!outcome.result || !Object.keys(outcome.result).length) {
                    fail(t, 'unknown');
                }
                else {
                    t.status = 'completed';
                    t.result = outcome.result;
                    delete t.error;
                    delete t.failure;
                }
            }
            else if (outcome.kind === 'proposal') {
                // Transaction covers BOTH approval insertion and task binding. Replay uses stable task UUID.
                if (['paused', 'cancelled'].includes(plan.status)) {
                    t.status = plan.status === 'cancelled' ? 'cancelled' : 'pending';
                    t.attempts--;
                }
                else {
                    t.approvalId = await tx.createApproval(wake.conversationId, t.id, outcome.proposal);
                    t.status = 'waiting_approval';
                    t.waitUntil = new Date(this.now() + MAX_WAIT_MS).toISOString();
                    t.nextCheckAt = new Date(this.now() + WAIT_MS).toISOString();
                }
            }
            else if (outcome.kind === 'waiting') {
                t.status = 'waiting_approval';
                t.nextCheckAt = new Date(this.now() + WAIT_MS).toISOString();
            }
            else {
                fail(t, outcome.unknown ? 'unknown' : 'permanent');
                if (outcome.code)
                    t.error = chatPlanActionErrors[outcome.code];
            }
            settlePlan(plan);
        });
        const pending = p.tasks.find(t => t.status === 'pending' && ready(p, t));
        const waiting = p.tasks.find(t => t.status === 'waiting_approval' && t.approvalId);
        if (waiting || (['running', 'waiting_approval'].includes(p.status) && pending)) {
            const next = waiting ?? pending!;
            const delay = next.nextCheckAt ? Math.max(0, Date.parse(next.nextCheckAt) - this.now()) : 0;
            await this.queue.enqueue({ ...wake, version: p.version }, delay);
        }
    }
}
