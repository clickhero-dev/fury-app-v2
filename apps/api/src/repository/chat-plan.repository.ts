import { sql } from 'drizzle-orm';
import { db as defaultDb, type Database } from '@fury/db';
import { TenantScopedRepository } from './base.repository.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AccessTokenPayload } from '../lib/jwt.js';
import type { StoredPlan, PlanScope } from '../services/chat/chat-plan.domain.js';
export interface PlanProposal {
    path: '/api/studio/ai/generate-image' | '/api/studio/video/jobs' | '/api/planner/posts' | '/api/campaigns/create';
    body: Record<string, unknown>;
    display?: Record<string, unknown>;
}
export interface PlanApproval {
    id: string;
    status: string;
    path: string;
    body: Record<string, unknown>;
    result: Record<string, unknown> | null;
    expiresAt: string;
    executionStartedAt: string | null;
}
export interface ChatPlanStore {
    create(plan: StoredPlan): Promise<StoredPlan>;
    get(conversationId: string, id: string): Promise<StoredPlan>;
    list(conversationId: string): Promise<StoredPlan[]>;
    mutate(conversationId: string, id: string, version: number | undefined, fn: (plan: StoredPlan, tx: ChatPlanStore) => Promise<void> | void): Promise<StoredPlan>;
    createApproval(conversationId: string, id: string, proposal: PlanProposal): Promise<string>;
    readApproval(conversationId: string, id: string): Promise<PlanApproval | undefined>;
    cancelPendingApproval(conversationId: string, id: string): Promise<boolean>;
    currentIdentity(): Promise<AccessTokenPayload>;
}
export type PlanRepositoryFactory = (tenantId: string, userId: string) => ChatPlanStore;
const projection = sql `p.id,p.conversation_id AS "conversationId",p.title,p.goal,p.status,p.version,p.tasks,p.created_at AS "createdAt",p.updated_at AS "updatedAt"`;
function record(r: Record<string, unknown>): StoredPlan {
    return { ...r, createdAt: new Date(r.createdAt as string).toISOString(), updatedAt: new Date(r.updatedAt as string).toISOString() } as unknown as StoredPlan;
}
export class ChatPlanRepository extends TenantScopedRepository implements ChatPlanStore {
    constructor(tenantId: string, private readonly userId: string, database: Database = defaultDb) {
        super(tenantId, database);
    }
    private ownership() {
        return sql `p.tenant_id=${this.tenantId}::uuid AND p.user_id=${this.userId}::uuid AND c.tenant_id=p.tenant_id AND c.user_id=p.user_id`;
    }
    async assertOwned(conversationId: string): Promise<void> {
        const rows = await this.db.execute(sql `SELECT id FROM chat_conversations WHERE id=${conversationId}::uuid AND tenant_id=${this.tenantId}::uuid AND user_id=${this.userId}::uuid`);
        if (!rows.length)
            throw new AppError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
    }
    async currentIdentity(): Promise<AccessTokenPayload> {
        const rows = await this.db.execute(sql `SELECT u.id AS "userId",u.tenant_id AS "tenantId",u.email,u.role FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=${this.userId}::uuid AND u.tenant_id=${this.tenantId}::uuid AND u.deleted_at IS NULL AND t.deleted_at IS NULL`);
        if (!rows[0])
            throw new AppError(403, 'CHAT_PLAN_ACCESS_REVOKED', 'Seu acesso mudou. Verifique a conta antes de continuar.');
        return rows[0] as unknown as AccessTokenPayload;
    }
    async create(p: StoredPlan): Promise<StoredPlan> {
        const rows = await this.db.execute(sql `INSERT INTO chat_plans(id,tenant_id,user_id,conversation_id,title,goal,status,version,tasks) SELECT ${p.id}::uuid,c.tenant_id,c.user_id,c.id,${p.title},${p.goal},'draft',1,${JSON.stringify(p.tasks)}::jsonb FROM chat_conversations c WHERE c.id=${p.conversationId}::uuid AND c.tenant_id=${this.tenantId}::uuid AND c.user_id=${this.userId}::uuid RETURNING id`);
        if (!rows.length)
            throw new AppError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
        return this.get(p.conversationId, p.id);
    }
    async get(conversationId: string, id: string): Promise<StoredPlan> {
        const rows = await this.db.execute(sql `SELECT ${projection} FROM chat_plans p JOIN chat_conversations c ON c.id=p.conversation_id WHERE p.id=${id}::uuid AND c.id=${conversationId}::uuid AND ${this.ownership()}`);
        if (!rows[0])
            throw new AppError(404, 'CHAT_PLAN_NOT_FOUND', 'Plano não encontrado.');
        return record(rows[0]);
    }
    async list(conversationId: string): Promise<StoredPlan[]> {
        await this.assertOwned(conversationId);
        const rows = await this.db.execute(sql `SELECT ${projection} FROM chat_plans p JOIN chat_conversations c ON c.id=p.conversation_id WHERE c.id=${conversationId}::uuid AND ${this.ownership()} ORDER BY p.created_at,p.id`);
        return rows.map(record);
    }
    async mutate(conversationId: string, id: string, version: number | undefined, fn: (plan: StoredPlan, tx: ChatPlanStore) => Promise<void> | void): Promise<StoredPlan> {
        return this.db.transaction(async (tx) => {
            await tx.execute(sql `SET LOCAL lock_timeout='3s'`);
            await tx.execute(sql `SET LOCAL statement_timeout='15s'`);
            const r = new ChatPlanRepository(this.tenantId, this.userId, tx as unknown as Database);
            const rows = await tx.execute(sql `SELECT ${projection} FROM chat_plans p JOIN chat_conversations c ON c.id=p.conversation_id WHERE p.id=${id}::uuid AND c.id=${conversationId}::uuid AND ${this.ownership()} FOR UPDATE OF p`);
            if (!rows[0])
                throw new AppError(404, 'CHAT_PLAN_NOT_FOUND', 'Plano não encontrado.');
            const p = record(rows[0]);
            if (version !== undefined && p.version !== version)
                throw new AppError(409, 'CHAT_PLAN_VERSION', 'O plano mudou. Atualize a conversa antes de tentar novamente.');
            const before = JSON.stringify(p);
            await fn(p, r);
            if (before === JSON.stringify(p))
                return p;
            const changed = await tx.execute(sql `UPDATE chat_plans p SET title=${p.title},goal=${p.goal},status=${p.status},tasks=${JSON.stringify(p.tasks)}::jsonb,version=version+1,updated_at=now() WHERE p.id=${id}::uuid AND p.tenant_id=${this.tenantId}::uuid AND p.user_id=${this.userId}::uuid AND p.conversation_id=${conversationId}::uuid AND p.version=${p.version} RETURNING p.version,p.updated_at AS "updatedAt"`);
            if (!changed[0])
                throw new AppError(409, 'CHAT_PLAN_VERSION', 'O plano mudou.');
            p.version = Number(changed[0].version);
            p.updatedAt = new Date(changed[0].updatedAt as string).toISOString();
            return p;
        });
    }
    async createApproval(conversationId: string, id: string, proposal: PlanProposal): Promise<string> {
        if (!['/api/studio/ai/generate-image', '/api/studio/video/jobs', '/api/planner/posts', '/api/campaigns/create'].includes(proposal.path))
            throw new AppError(400, 'CHAT_PLAN_CAPABILITY', 'Proposta inválida.');
        await this.assertOwned(conversationId);
        await this.db.execute(sql `INSERT INTO chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,display,expires_at) VALUES(${id}::uuid,${this.tenantId}::uuid,${this.userId}::uuid,${conversationId}::uuid,'POST',${proposal.path},${JSON.stringify(proposal.body)}::jsonb,${JSON.stringify(proposal.display ?? proposal.body)}::jsonb,now()+interval '24 hours') ON CONFLICT(id) DO NOTHING`);
        const existing = await this.readApproval(conversationId, id);
        if (!existing || existing.path !== proposal.path || JSON.stringify(sort(existing.body)) !== JSON.stringify(sort(proposal.body)))
            throw new AppError(409, 'CHAT_PLAN_APPROVAL_CONFLICT', 'A proposta mudou. Crie um plano revisado.');
        return id;
    }
    async cancelPendingApproval(conversationId: string, id: string): Promise<boolean> {
        const rows = await this.db.execute(sql `UPDATE chat_approvals a SET status='cancelled' FROM chat_conversations c WHERE c.id=a.conversation_id AND c.id=${conversationId}::uuid AND a.id=${id}::uuid AND a.tenant_id=${this.tenantId}::uuid AND a.user_id=${this.userId}::uuid AND c.tenant_id=a.tenant_id AND c.user_id=a.user_id AND a.status IN ('pending','approved') RETURNING a.id`);
        return rows.length === 1;
    }
    async readApproval(conversationId: string, id: string): Promise<PlanApproval | undefined> {
        const rows = await this.db.execute(sql `SELECT a.id,a.status,a.path,a.body,a.result,a.expires_at AS "expiresAt",a.execution_started_at AS "executionStartedAt" FROM chat_approvals a JOIN chat_conversations c ON c.id=a.conversation_id WHERE a.id=${id}::uuid AND c.id=${conversationId}::uuid AND a.tenant_id=${this.tenantId}::uuid AND a.user_id=${this.userId}::uuid AND c.tenant_id=a.tenant_id AND c.user_id=a.user_id`);
        return rows[0] as unknown as PlanApproval | undefined;
    }
}
function sort(v: unknown): unknown {
    if (Array.isArray(v))
        return v.map(sort);
    if (v && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sort(x)]));
    return v;
}
/** GLOBAL recovery inventory is identifiers only; execution re-enters tenant+user scoped repository. */
export class ChatPlanRecoveryRepository {
    constructor(private readonly database: Database = defaultDb) {
    }
    async listRecoverable(afterId?: string): Promise<(PlanScope & {
        planId: string;
        version: number;
    })[]> {
        const rows = await this.database.execute(sql `SELECT p.id AS "planId",p.tenant_id AS "tenantId",p.user_id AS "userId",p.conversation_id AS "conversationId",p.version FROM chat_plans p WHERE (${afterId ?? null}::uuid IS NULL OR p.id>${afterId ?? null}::uuid) AND (p.status='running' OR (p.status IN ('waiting_approval','paused','cancelled') AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.tasks) t WHERE t->>'status' IN ('running','waiting_approval') AND t->>'capability'<>'manual'))) ORDER BY p.id LIMIT 100`);
        return rows as unknown as (PlanScope & {
            planId: string;
            version: number;
        })[];
    }
}
