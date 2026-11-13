import { randomUUID } from 'node:crypto';
import { AppError } from '../middleware/errorHandler.js';
import type { ChatPlanStore, PlanProposal, PlanApproval } from '../repository/chat-plan.repository.js';
import type { StoredPlan } from '../services/chat/chat-plan.domain.js';
export function planMemoryFixture() {
    const tenantId = randomUUID(), userId = randomUUID(), conversationId = randomUUID();
    const plans = new Map<string, StoredPlan>(), approvals = new Map<string, PlanApproval>();
    let revoked = false;
    let tail = Promise.resolve();
    const factory = (t: string, u: string): ChatPlanStore => {
        const own = (c: string) => {
            if (t !== tenantId || u !== userId || c !== conversationId)
                throw new AppError(404, 'NOT_FOUND', 'Não encontrado');
        };
        const repo: ChatPlanStore = {
            async currentIdentity() {
                if (revoked)
                    throw new AppError(403, 'REVOKED', 'Revogado');
                return { userId: u, tenantId: t, email: 'test@example.test', role: 'member' };
            },
            async create(p) {
                own(p.conversationId);
                plans.set(p.id, structuredClone(p));
                return structuredClone(p);
            },
            async get(c, id) {
                own(c);
                const p = plans.get(id);
                if (!p)
                    throw new AppError(404, 'NOT_FOUND', 'Não encontrado');
                return structuredClone(p);
            },
            async list(c) {
                own(c);
                return [...plans.values()].map(p => structuredClone(p));
            },
            async mutate(c, id, v, fn) {
                const previous = tail;
                let release!: () => void;
                tail = new Promise<void>(r => {
                    release = r;
                });
                await previous;
                try {
                    const p = await repo.get(c, id);
                    if (v !== undefined && p.version !== v)
                        throw new AppError(409, 'VERSION', 'Obsoleto');
                    const old = JSON.stringify(p);
                    await fn(p, repo);
                    if (old !== JSON.stringify(p)) {
                        p.version++;
                        plans.set(p.id, structuredClone(p));
                    }
                    return structuredClone(p);
                }
                finally {
                    release();
                }
            },
            async createApproval(c, id, p: PlanProposal) {
                own(c);
                if (!approvals.has(id))
                    approvals.set(id, { id, status: 'pending', path: p.path, body: p.body, result: null, expiresAt: new Date(Date.now() + 86400000).toISOString(), executionStartedAt: null });
                return id;
            },
            async cancelPendingApproval(c, id) {
                own(c);
                const a = approvals.get(id);
                if (!a || !['pending', 'approved'].includes(a.status))
                    return false;
                a.status = 'cancelled';
                return true;
            },
            async readApproval(c, id) {
                own(c);
                return structuredClone(approvals.get(id));
            },
        };
        return repo;
    };
    return { tenantId, userId, conversationId, scope: { tenantId, userId, conversationId }, factory, plans, approvals, revoke: () => {
            revoked = true;
        } };
}
