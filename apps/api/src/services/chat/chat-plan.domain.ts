import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler.js';
export const capabilities = ['read_brand', 'read_calendar', 'read_campaigns', 'draft_text', 'propose_image', 'propose_video', 'propose_post', 'propose_campaign', 'manual'] as const;
export type ChatCapability = typeof capabilities[number];
export type PlanStatus = 'draft' | 'running' | 'paused' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
export type TaskStatus = 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
export type PlanActor = 'human' | 'chatbot';
export interface PlanScope {
    tenantId: string;
    userId: string;
    conversationId: string;
}
export interface PlanResult {
    summary?: string;
    text?: string;
    reference?: {
        kind: string;
        id: string;
    };
    data?: unknown;
}
export interface PlanTaskInput {
    key: string;
    title: string;
    capability: ChatCapability;
    parameters: Record<string, unknown>;
    dependsOn: string[];
}
export interface ChatPlanTask extends PlanTaskInput {
    id: string;
    status: TaskStatus;
    result?: PlanResult;
    error?: string;
    approvalId?: string;
}
/** Internal execution metadata is business state/fencing, not operational job history. */
export interface StoredTask extends ChatPlanTask {
    attempts: number;
    fence?: string;
    leaseUntil?: string;
    failure?: 'retryable' | 'unknown' | 'permanent' | 'revoked';
    nextCheckAt?: string;
    waitUntil?: string;
}
export interface ChatPlan {
    id: string;
    conversationId: string;
    title: string;
    goal: string;
    status: PlanStatus;
    version: number;
    tasks: ChatPlanTask[];
    createdAt: string;
    updatedAt: string;
}
export interface StoredPlan extends Omit<ChatPlan, 'tasks'> {
    tasks: StoredTask[];
}
export type PlanInput = {
    title: string;
    goal: string;
    tasks: PlanTaskInput[];
};
export type PlanAction = 'approve' | 'pause' | 'resume' | 'cancel' | 'complete';
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const https = z.string().url().max(2048).refine(v => {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password;
});
const models = ['black-forest-labs/flux.2-klein-4b', 'black-forest-labs/flux.2-max', 'black-forest-labs/flux.2-pro', 'bytedance-seed/seedream-5-0-pro', 'x-ai/grok-imagine-image-2.0', 'qwen/qwen-image-3-pro', 'google/gemini-3.1-flash-image'] as const;
export const parameterSchemas = {
    read_brand: z.object({}).strict(),
    read_calendar: z.object({ startDate: date, endDate: date }).strict().refine(p => p.startDate <= p.endDate && Date.parse(p.endDate) - Date.parse(p.startDate) <= 366 * 86400000),
    read_campaigns: z.object({ limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).max(100000).optional() }).strict(),
    draft_text: z.object({ prompt: text(1, 6000) }).strict(),
    propose_image: z.object({ prompt: text(10, 1000), model: z.enum(models), aspect_ratio: z.enum(['1:1', '16:9', '9:16']).default('1:1'), resolution: z.enum(['1K', '2K', '4K']).default('2K'), photo_ids: z.array(z.string().uuid()).max(2).optional(), reference_image_urls: z.array(https).max(2).optional() }).strict().refine(p => !(p.photo_ids?.length && p.reference_image_urls?.length)),
    propose_video: z.object({ prompt: text(10, 1000), visual: text(3, 600), narration: z.string().max(400).default(''), aspect_ratio: z.enum(['16:9', '9:16']).default('9:16'), photo_ids: z.array(z.string().uuid()).max(4).default([]) }).strict(),
    propose_post: z.object({ caption: z.string().max(5000), post_type: z.enum(['image', 'reel', 'stories', 'carousel']), scheduled_at: z.string().datetime({ offset: true }), image_url: https.optional(), image_urls: z.array(https).min(2).max(10).optional() }).strict().superRefine((p, c) => {
        const video = (s: string) => /\.(mp4|mov)(\?|$)/i.test(s);
        const valid = p.post_type === 'carousel' ? p.image_urls && !p.image_url && new Set(p.image_urls.map(video)).size === 1 : p.image_url && !p.image_urls && (p.post_type !== 'reel' || video(p.image_url)) && (p.post_type !== 'image' || !video(p.image_url));
        if (!valid || Date.parse(p.scheduled_at) <= Date.now())
            c.addIssue({ code: 'custom', message: 'Informe mídia válida e horário futuro com fuso.' });
    }),
    propose_campaign: z.object({ name: text(3, 255), objective: z.enum(['OUTCOME_SALES', 'OUTCOME_LEADS', 'OUTCOME_TRAFFIC', 'OUTCOME_AWARENESS']), daily_budget_cents: z.number().int().min(500).max(100000000), ad_account_id: z.string().regex(/^act_\d{1,32}$/) }).strict(),
    manual: z.object({ instructions: text(1, 4000) }).strict(),
};
const taskSchema = z.object({ key: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), title: text(1, 200), capability: z.enum(capabilities), parameters: z.record(z.unknown()), dependsOn: z.array(z.string().max(64)).max(19) }).strict();
const inputSchema = z.object({ title: text(1, 200), goal: text(1, 4000), tasks: z.array(taskSchema).min(1).max(20) }).strict();
export const versionSchema = z.object({ version: z.number().int().positive() }).strict();
export const patchPlanSchema = z.object({ version: z.number().int().positive(), title: text(1, 200).optional(), goal: text(1, 4000).optional(), tasks: z.array(taskSchema).min(1).max(20).optional() }).strict();
export function parsePlanInput(value: unknown): PlanInput {
    const p = inputSchema.parse(value);
    const byKey = new Map(p.tasks.map(t => [t.key, t]));
    if (byKey.size !== p.tasks.length)
        throw new AppError(400, 'CHAT_PLAN_INVALID', 'Cada tarefa precisa de uma chave única.');
    const visited = new Set<string>(), visiting = new Set<string>();
    const visit = (key: string): void => {
        if (visited.has(key))
            return;
        if (visiting.has(key) || !byKey.has(key))
            throw new AppError(400, 'CHAT_PLAN_INVALID', 'Dependências inválidas ou cíclicas.');
        visiting.add(key);
        const t = byKey.get(key)!;
        if (new Set(t.dependsOn).size !== t.dependsOn.length)
            throw new AppError(400, 'CHAT_PLAN_INVALID', 'Dependências repetidas.');
        t.dependsOn.forEach(visit);
        visiting.delete(key);
        visited.add(key);
    };
    p.tasks.forEach(t => {
        visit(t.key);
        t.parameters = parameterSchemas[t.capability].parse(t.parameters);
    });
    return p;
}
export function newTasks(tasks: PlanTaskInput[]): StoredTask[] {
    return tasks.map(t => ({ ...t, id: randomUUID(), status: 'pending', attempts: 0 }));
}
export function newPlan(conversationId: string, input: PlanInput): StoredPlan {
    const now = new Date().toISOString();
    return { ...input, id: randomUUID(), conversationId, status: 'draft', version: 1, tasks: newTasks(input.tasks), createdAt: now, updatedAt: now };
}
export function publicPlan(plan: StoredPlan): ChatPlan {
    return { ...plan, tasks: plan.tasks.map(({ attempts: _a, fence: _f, leaseUntil: _l, failure: _e, nextCheckAt: _n, waitUntil: _w, ...t }) => t) };
}
export function ready(plan: StoredPlan, t: StoredTask): boolean {
    return t.dependsOn.every(key => plan.tasks.find(x => x.key === key)?.status === 'completed');
}
export function settlePlan(plan: StoredPlan): void {
    if (['paused', 'cancelled', 'draft'].includes(plan.status))
        return;
    plan.status = plan.tasks.every(t => t.status === 'completed') ? 'completed' : plan.tasks.some(t => t.status === 'failed') ? 'failed' : plan.tasks.some(t => t.status === 'waiting_approval') ? 'waiting_approval' : 'running';
}
export function editPlan(plan: StoredPlan, patch: Partial<PlanInput>): void {
    if (plan.status !== 'draft')
        throw new AppError(409, 'CHAT_PLAN_STARTED', 'Pause e crie um plano revisado. O progresso original será preservado.');
    const input = parsePlanInput({ title: patch.title ?? plan.title, goal: patch.goal ?? plan.goal, tasks: patch.tasks ?? plan.tasks.map(({ key, title, capability, parameters, dependsOn }) => ({ key, title, capability, parameters, dependsOn })) });
    plan.title = input.title;
    plan.goal = input.goal;
    if (patch.tasks)
        plan.tasks = newTasks(input.tasks);
}
export function changePlan(plan: StoredPlan, action: PlanAction, actor: PlanActor, taskId?: string): void {
    if (actor !== 'human')
        throw new AppError(403, 'CHAT_PLAN_HUMAN_REQUIRED', 'Esta ação exige sua confirmação pessoal.');
    const conflict = () => {
        throw new AppError(409, 'CHAT_PLAN_STATE', 'O plano mudou ou esta ação não está disponível. Atualize a conversa.');
    };
    if (action === 'approve') {
        if (plan.status !== 'draft')
            conflict();
        plan.status = 'running';
    }
    if (action === 'pause') {
        if (!['running', 'waiting_approval'].includes(plan.status))
            conflict();
        plan.status = 'paused';
    }
    if (action === 'resume') {
        if (!['paused', 'failed'].includes(plan.status))
            conflict();
        if (plan.tasks.some(t => t.status === 'failed' && t.failure !== 'retryable' && !(t.failure === 'unknown' && t.approvalId)))
            conflict();
        for (const t of plan.tasks)
            if (t.status === 'failed') {
                t.status = t.approvalId ? 'waiting_approval' : 'pending';
                if (t.approvalId)
                    t.waitUntil = new Date(Date.now() + 3600000).toISOString();
                delete t.error;
                delete t.nextCheckAt;
            }
        plan.status = 'running';
        settlePlan(plan);
    }
    if (action === 'cancel') {
        if (['completed', 'cancelled'].includes(plan.status))
            conflict();
        plan.status = 'cancelled';
        for (const t of plan.tasks)
            if (['pending', 'failed'].includes(t.status))
                t.status = 'cancelled';
    }
    if (action === 'complete') {
        const t = plan.tasks.find(t => t.id === taskId);
        if (!t)
            throw new AppError(404, 'CHAT_PLAN_TASK_NOT_FOUND', 'Tarefa não encontrada.');
        if (t.capability !== 'manual')
            throw new AppError(403, 'CHAT_PLAN_VERIFICATION_REQUIRED', 'A tarefa automática exige resultado verificado.');
        if (!['running', 'waiting_approval'].includes(plan.status) || !['pending', 'waiting_approval'].includes(t.status) || !ready(plan, t))
            conflict();
        t.status = 'completed';
        t.result = { summary: 'Conclusão confirmada pelo usuário.' };
        settlePlan(plan);
    }
}
