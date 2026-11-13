import { chatPlanActionErrorCode } from './chat-plan-errors.js';
import { z } from 'zod';
import type { AccessTokenPayload } from '../../lib/jwt.js';
import type { ChatPlanStore } from '../../repository/chat-plan.repository.js';
import { parameterSchemas, type PlanScope, type StoredTask, type StoredPlan } from './chat-plan.domain.js';
import { PlanStepError, type PlanCapabilities, type StepOutcome } from './chat-plan-executor.js';
export interface PlanResources {
    photos(ids: string[]): Promise<{
        id: string;
        kind: string;
    }[]>;
    brand(): Promise<{
        photoUrls: unknown;
    } | undefined>;
    assetByUrl(url: string): Promise<{
        id: string;
        type: string;
        url: string | null;
        deletedAt?: Date | null;
    } | null | undefined>;
    asset(id: string): Promise<{
        id: string;
        type: string;
        url: string | null;
        deletedAt?: Date | null;
    } | null | undefined>;
    post(id: string): Promise<{
        id: string;
        status: string;
        scheduledAt: string | Date | null;
    } | null | undefined>;
    campaign(id: string): Promise<{
        id: string;
        metaCampaignId: string | null;
        status: string;
    } | null | undefined>;
}
export interface PlanCapabilityDependencies {
    get(user: AccessTokenPayload, path: string): Promise<unknown>;
    text(tenantId: string, prompt: string, context: string): Promise<string>;
    videoOptions(tenantId: string): Promise<{
        enabled: boolean;
        videosRemaining: number | null;
    }>;
    resources(tenantId: string): PlanResources;
}
const object = z.record(z.unknown());
const uuid = z.string().uuid();
function obj(v: unknown): Record<string, unknown> {
    const r = object.safeParse(v);
    if (!r.success)
        throw new PlanStepError('invalid');
    return r.data;
}
function body(v: unknown): Record<string, unknown> {
    const x = obj(v);
    if (Array.isArray(x.partial_failures) && x.partial_failures.length)
        throw new PlanStepError('partial');
    if (x.success === false || x.error)
        throw new PlanStepError('invalid');
    return x;
}
function pick(v: unknown, keys: string[]): Record<string, unknown> {
    const x = obj(v);
    return Object.fromEntries(keys.filter(k => x[k] !== undefined).map(k => [k, x[k]]));
}
function safeText(s: string): string {
    return s.replace(/Bearer\s+[a-zA-Z0-9._~-]+/gi, '[credencial omitida]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[credencial omitida]');
}
const proposalPaths = { propose_image: '/api/studio/ai/generate-image', propose_video: '/api/studio/video/jobs', propose_post: '/api/planner/posts', propose_campaign: '/api/campaigns/create' } as const;
/** Closed capability registry: no user-provided URL, method, model tool or shell execution. */
export class ChatPlanCapabilities implements PlanCapabilities {
    constructor(private readonly deps: PlanCapabilityDependencies) {
    }
    async execute(scope: PlanScope, plan: StoredPlan, task: StoredTask, user: AccessTokenPayload): Promise<StepOutcome> {
        const params = parameterSchemas[task.capability].parse(task.parameters);
        if (task.capability === 'read_brand') {
            const r = body(await this.deps.get(user, '/api/brand-kit'));
            return { kind: 'completed', result: { summary: 'Marca consultada.', data: pick(r.data, ['id', 'primaryColor', 'secondaryColor', 'voiceTone']) } };
        }
        if (task.capability === 'read_calendar') {
            const p = parameterSchemas.read_calendar.parse(params);
            const r = body(await this.deps.get(user, `/api/planner/calendar?startDate=${p.startDate}&endDate=${p.endDate}`));
            const d = obj(r.data);
            if (!Array.isArray(d.posts))
                throw new PlanStepError('invalid');
            return { kind: 'completed', result: { summary: `Calendário consultado: ${d.posts.length} postagens no intervalo.`, data: { startDate: p.startDate, endDate: p.endDate, posts: d.posts.slice(0, 300).map(p => pick(p, ['id', 'caption', 'date', 'scheduledAt', 'status', 'postType', 'platform'])) } } };
        }
        if (task.capability === 'read_campaigns') {
            const p = parameterSchemas.read_campaigns.parse(params);
            const r = body(await this.deps.get(user, `/api/campaigns?limit=${p.limit ?? 20}&offset=${p.offset ?? 0}`));
            if (!Array.isArray(r.data))
                throw new PlanStepError('invalid');
            return { kind: 'completed', result: { summary: `Consulta retornou ${r.data.length} campanhas nesta página.`, data: { campaigns: r.data.map(c => pick(c, ['id', 'name', 'objective', 'status', 'dailyBudget'])), pagination: r.pagination ? pick(r.pagination, ['total', 'limit', 'offset']) : undefined } } };
        }
        if (task.capability === 'draft_text') {
            const p = parameterSchemas.draft_text.parse(params);
            const context = JSON.stringify(plan.tasks.filter(t => task.dependsOn.includes(t.key) && t.status === 'completed').map(t => ({ title: t.title, result: t.result }))).slice(0, 16000);
            const text = await this.deps.text(scope.tenantId, p.prompt, context);
            if (typeof text !== 'string' || !text.trim() || text.length > 24000)
                throw new PlanStepError('unknown');
            return { kind: 'completed', result: { summary: 'Rascunho gerado. Não foi publicado.', text: safeText(text) } };
        }
        const resources = this.deps.resources(scope.tenantId);
        if (task.capability === 'propose_image') {
            const p = parameterSchemas.propose_image.parse(params);
            await this.photos(resources, p.photo_ids ?? []);
            if (p.reference_image_urls?.length) {
                const brand = await resources.brand();
                const owned = Array.isArray(brand?.photoUrls) ? brand.photoUrls : [];
                if (!p.reference_image_urls.every(u => owned.includes(u)))
                    throw new PlanStepError('invalid');
            }
            return { kind: 'proposal', proposal: { path: proposalPaths.propose_image, body: p } };
        }
        if (task.capability === 'propose_video') {
            const options = await this.deps.videoOptions(scope.tenantId);
            if (options.enabled !== true)
                throw new PlanStepError('video_not_in_plan');
            if (options.videosRemaining !== null && (!Number.isFinite(options.videosRemaining) || options.videosRemaining <= 0))
                throw new PlanStepError('video_quota');
            const p = parameterSchemas.propose_video.parse(params);
            await this.photos(resources, p.photo_ids);
            return { kind: 'proposal', proposal: { path: proposalPaths.propose_video, body: { prompt: p.prompt, photoIds: p.photo_ids, aspectRatio: p.aspect_ratio, duration: 15, scenes: [{ start: 0, end: 15, visual: p.visual, narration: p.narration }] } } };
        }
        if (task.capability === 'propose_post') {
            const p = parameterSchemas.propose_post.parse(params);
            for (const url of p.image_urls ?? [p.image_url!]) {
                const a = await resources.assetByUrl(url);
                if (!a || a.deletedAt || !['image', 'video'].includes(a.type))
                    throw new PlanStepError('invalid');
            }
            const at = new Date(p.scheduled_at);
            const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
            const part = (type: string) => parts.find(p => p.type === type)!.value;
            const payload = { caption: p.caption, postType: p.post_type, platform: 'instagram', date: `${part('year')}-${part('month')}-${part('day')}`, scheduledAt: at.toISOString(), ...(p.post_type === 'carousel' ? { imageUrls: p.image_urls } : { imageUrl: p.image_url }) };
            return { kind: 'proposal', proposal: { path: proposalPaths.propose_post, body: payload } };
        }
        if (task.capability === 'propose_campaign') {
            const p = parameterSchemas.propose_campaign.parse(params);
            const account = obj(body(await this.deps.get(user, `/api/campaigns/chat-account/${p.ad_account_id}`)).data);
            if (account.id !== p.ad_account_id || account.currency !== 'BRL')
                throw new PlanStepError('invalid');
            const payload = { name: p.name, objective: p.objective, dailyBudget: p.daily_budget_cents, adAccountId: p.ad_account_id };
            return { kind: 'proposal', proposal: { path: proposalPaths.propose_campaign, body: payload, display: { ...payload, currency: 'BRL' } } };
        }
        throw new PlanStepError('invalid');
    }
    private async photos(resources: PlanResources, ids: string[]) {
        if (!ids.length)
            return;
        const photos = await resources.photos(ids);
        if (ids.some(id => !photos.some(p => p.id === id && ['produto', 'equipe'].includes(p.kind))))
            throw new PlanStepError('invalid');
    }
    async reconcile(scope: PlanScope, task: StoredTask, user: AccessTokenPayload, repo: ChatPlanStore): Promise<StepOutcome> {
        const a = task.approvalId ? await repo.readApproval(scope.conversationId, task.approvalId) : undefined;
        const expected = proposalPaths[task.capability as keyof typeof proposalPaths];
        if (!a || a.path !== expected)
            return { kind: 'failed', unknown: true };
        if (['cancelled', 'failed'].includes(a.status)) {
            const code = chatPlanActionErrorCode(a.result?.code);
            return code ? { kind: 'failed', code } : { kind: 'failed' };
        }
        if (['pending', 'approved'].includes(a.status) && Date.parse(a.expiresAt) <= Date.now())
            return { kind: 'failed' };
        if (['pending', 'approved'].includes(a.status))
            return { kind: 'waiting' };
        const resources = this.deps.resources(scope.tenantId);
        // Async video approval 'completed' proves submission only. Stable job is authoritative.
        if (task.capability === 'propose_video') {
            const result = a.result ?? {};
            const jobId = result.jobId ?? a.id;
            if (!uuid.safeParse(jobId).success)
                return { kind: 'failed', unknown: true };
            let r: Record<string, unknown>;
            try {
                r = body(await this.deps.get(user, `/api/studio/video/jobs/${jobId}`));
            }
            catch (e) {
                if ((e as { statusCode?: number }).statusCode === 404) {
                    // Approval consumption precedes job insertion. This bounded window only reads;
                    // it never resubmits the external action when a response is missing.
                    const recentlyStarted = a.status === 'executing' && a.executionStartedAt && Date.parse(a.executionStartedAt) + 5 * 60000 > Date.now();
                    return recentlyStarted ? { kind: 'waiting' } : { kind: 'failed', unknown: true };
                }
                if (e instanceof PlanStepError && e.reason === 'invalid')
                    return { kind: 'failed', unknown: true };
                throw e;
            }
            if (r.jobId !== jobId)
                return { kind: 'failed', unknown: true };
            if (r.status === 'error')
                return { kind: 'failed' };
            if (['pending', 'running'].includes(String(r.status)))
                return { kind: 'waiting' };
            if (r.status !== 'done' || !uuid.safeParse(r.assetId).success)
                return { kind: 'failed', unknown: true };
            return this.confirmAsset(resources, String(r.assetId), 'video');
        }
        if (a.status === 'unknown')
            return { kind: 'failed', unknown: true };
        if (a.status !== 'completed') {
            if (a.executionStartedAt && Date.parse(a.executionStartedAt) + 5 * 60000 < Date.now())
                return { kind: 'failed', unknown: true };
            return { kind: 'waiting' };
        }
        if (!a.result)
            return { kind: 'waiting' }; // response body may arrive just after the completion marker
        if (a.result.error || a.result.success === false)
            return { kind: 'failed', unknown: true };
        const result = obj(a.result.data ?? a.result);
        if (task.capability === 'propose_image') {
            const id = result.creativeAssetId ?? result.assetId;
            if (!uuid.safeParse(id).success)
                return { kind: 'failed', unknown: true };
            return this.confirmAsset(resources, String(id), 'image');
        }
        if (!uuid.safeParse(result.id).success)
            return { kind: 'failed', unknown: true };
        const id = String(result.id);
        if (task.capability === 'propose_post') {
            const post = await resources.post(id);
            if (!post || post.id !== id)
                return { kind: 'failed', unknown: true };
            const scheduled = post.status === 'approved' && post.scheduledAt;
            if (!scheduled && post.status !== 'published')
                return { kind: 'failed', unknown: true };
            return { kind: 'completed', result: { summary: post.status === 'published' ? 'Postagem publicada e confirmada.' : 'Postagem agendada e confirmada. Ainda não foi publicada.', reference: { kind: 'post', id } } };
        }
        const campaign = await resources.campaign(id);
        if (!campaign || campaign.id !== id || !campaign.metaCampaignId)
            return { kind: 'failed', unknown: true };
        return { kind: 'completed', result: { summary: `Campanha criada e confirmada. Estado: ${['ACTIVE', 'PAUSED', 'active', 'paused'].includes(campaign.status) ? campaign.status : 'consultar na campanha'}.`, reference: { kind: 'campaign', id } } };
    }
    private async confirmAsset(resources: PlanResources, id: string, type: string): Promise<StepOutcome> {
        const asset = await resources.asset(id);
        if (!asset || asset.id !== id || asset.type !== type || !asset.url || asset.deletedAt)
            return { kind: 'failed', unknown: true };
        return { kind: 'completed', result: { summary: type === 'video' ? 'Vídeo gerado e salvo. Não foi publicado.' : 'Imagem gerada e salva. Não foi publicada.', reference: { kind: 'asset', id } } };
    }
}
