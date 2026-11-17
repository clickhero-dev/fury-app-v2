/* Funcionalidade: capacidades concretas reutilizam APIs/services reais.
 * Cenário: Dado leitura parcial, quando consultar, então não inventa sucesso.
 * Cenário: Dado texto, quando gerar, então retorna saída real sem chamada genérica do agente.
 * Cenário: Dado proposta, quando preparar, então valida escopo e não chama POST externo.
 * Cenário: Dado job apenas criado/approval completed, quando reconciliar, então não conclui mídia.
 * Cenário: Dado recurso final ausente/estrangeiro, quando reconciliar, então falha fechada.
 */
import { beforeEach, describe, it, expect, vi, type Mock } from 'vitest';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { ChatPlanCapabilities } from '../services/chat/chat-plan-capabilities.js';
import { newPlan, parsePlanInput } from '../services/chat/chat-plan.domain.js';
import { planMemoryFixture } from './chat-plan.fixtures.js';
let f: ReturnType<typeof planMemoryFixture>, get: Mock<any[], Promise<any>>, text: Mock<any[], Promise<any>>, resources: any, adapter: ChatPlanCapabilities;
const imageId = '11111111-1111-4111-8111-111111111111';
function plan(capability: string, parameters = {}) {
    return newPlan(f.conversationId, parsePlanInput({ title: 'Plano', goal: 'Preparar', tasks: [{ key: 't', title: 'Etapa', capability, parameters, dependsOn: [] }] }));
}
async function run(capability: string, parameters = {}) {
    const p = plan(capability, parameters);
    return adapter.execute(f.scope, p, p.tasks[0], await f.factory(f.tenantId, f.userId).currentIdentity());
}
beforeEach(() => {
    f = planMemoryFixture();
    get = vi.fn();
    text = vi.fn(async () => 'Texto efetivamente gerado');
    resources = { photos: vi.fn(async () => []), brand: vi.fn(async () => ({ photoUrls: [] })), assetByUrl: vi.fn(async () => null), asset: vi.fn(async () => null), post: vi.fn(async () => null), campaign: vi.fn(async () => null) };
    adapter = new ChatPlanCapabilities({ get, text, resources: () => resources, videoOptions: async () => ({ enabled: true, videosRemaining: 3 }) });
});
describe('adapters concretos', () => {
    it('lê marca via endpoint existente e remove campos privados', async () => {
        get.mockResolvedValue({ success: true, data: { primaryColor: '#ffffff', accessToken: 'never', voiceTone: 'casual' } });
        const out = await run('read_brand');
        expect(out).toMatchObject({ kind: 'completed', result: { data: { primaryColor: '#ffffff' } } });
        expect(JSON.stringify(out)).not.toContain('never');
        expect(get.mock.calls[0][1]).toBe('/api/brand-kit');
    });
    it('falha parcial e shape inválido não passam por sucesso', async () => {
        get.mockResolvedValue({ data: [], partial_failures: [{ reason: 'private' }] });
        await expect(run('read_campaigns')).rejects.toMatchObject({ reason: 'partial' });
        get.mockResolvedValue({ success: true });
        await expect(run('read_calendar', { startDate: '2026-11-01', endDate: '2026-11-10' })).rejects.toThrow();
    });
    it('draft_text usa saída real, nunca inventa', async () => {
        expect(await run('draft_text', { prompt: 'Texto da semana' })).toMatchObject({ kind: 'completed', result: { text: 'Texto efetivamente gerado' } });
        text.mockResolvedValue('');
        await expect(run('draft_text', { prompt: 'Texto' })).rejects.toThrow();
    });
    it('vídeo sem benefício ou sem cota não cria proposta', async () => {
        const p = { prompt: 'Vídeo do produto', visual: 'Mesa branca' };
        adapter = new ChatPlanCapabilities({ get, text, resources: () => resources, videoOptions: async () => ({ enabled: false, videosRemaining: 0 }) });
        await expect(run('propose_video', p)).rejects.toMatchObject({ reason: 'video_not_in_plan', message: 'Seu plano não inclui criação de vídeo.' });
        adapter = new ChatPlanCapabilities({ get, text, resources: () => resources, videoOptions: async () => ({ enabled: true, videosRemaining: 0 }) });
        await expect(run('propose_video', p)).rejects.toMatchObject({ reason: 'video_quota', message: 'Sua cota de vídeos está esgotada neste período.' });
        expect(get).not.toHaveBeenCalled();
    });
    it('imagem usa contrato existente mas só cria proposta', async () => {
        const out = await run('propose_image', { prompt: 'Produto na mesa branca', model: 'black-forest-labs/flux.2-pro' });
        expect(out).toMatchObject({ kind: 'proposal', proposal: { path: '/api/studio/ai/generate-image', body: { aspect_ratio: '1:1', resolution: '2K' } } });
        expect(get).not.toHaveBeenCalled();
    });
    it('bloqueia foto alheia, URL arbitrária e asset não pertencente', async () => {
        await expect(run('propose_image', { prompt: 'Produto na mesa branca', model: 'black-forest-labs/flux.2-pro', photo_ids: [imageId] })).rejects.toThrow();
        await expect(run('propose_post', { caption: 'ok', post_type: 'image', image_url: 'https://example.test/private.png', scheduled_at: '2099-11-10T15:00:00Z' })).rejects.toThrow();
    });
    it('campanha exige conta BRL e usa cents sem normalizar', async () => {
        get.mockResolvedValue({ data: { id: 'act_123', currency: 'USD' } });
        await expect(run('propose_campaign', { name: 'Campanha', objective: 'OUTCOME_LEADS', ad_account_id: 'act_123', daily_budget_cents: 500 })).rejects.toThrow();
        get.mockResolvedValue({ data: { id: 'act_123', currency: 'BRL' } });
        expect(await run('propose_campaign', { name: 'Campanha', objective: 'OUTCOME_LEADS', ad_account_id: 'act_123', daily_budget_cents: 500 })).toMatchObject({ proposal: { body: { dailyBudget: 500 }, display: { currency: 'BRL' } } });
    });
    it('job criado não é vídeo concluído; lê estado autoritativo e asset', async () => {
        const p = plan('propose_video', { prompt: 'Vídeo do produto', visual: 'Mesa branca' }), task = p.tasks[0];
        task.approvalId = task.id;
        const repo = f.factory(f.tenantId, f.userId);
        await repo.createApproval(f.conversationId, task.id, { path: '/api/studio/video/jobs', body: {} });
        f.approvals.get(task.id)!.status = 'completed';
        f.approvals.get(task.id)!.result = { jobId: task.id };
        get.mockResolvedValue({ jobId: task.id, status: 'running' });
        const user = await repo.currentIdentity();
        expect(await adapter.reconcile(f.scope, task, user, repo)).toEqual({ kind: 'waiting' });
        get.mockResolvedValue({ jobId: task.id, status: 'done', assetId: imageId });
        expect(await adapter.reconcile(f.scope, task, user, repo)).toMatchObject({ kind: 'failed', unknown: true });
        resources.asset.mockResolvedValue({ id: imageId, type: 'video', url: 'https://owned.test/video.mp4' });
        expect(await adapter.reconcile(f.scope, task, user, repo)).toMatchObject({ kind: 'completed', result: { reference: { kind: 'asset', id: imageId } } });
    });
    it('aprovação de vídeo ainda não consumida e janela de criação do job não viram unknown', async () => {
        const p = plan('propose_video', { prompt: 'Vídeo do produto', visual: 'Mesa branca' });
        const task = p.tasks[0];
        task.approvalId = task.id;
        const repo = f.factory(f.tenantId, f.userId);
        await repo.createApproval(f.conversationId, task.id, { path: '/api/studio/video/jobs', body: {} });
        const approval = f.approvals.get(task.id)!;
        const user = await repo.currentIdentity();
        approval.status = 'approved';
        expect(await adapter.reconcile(f.scope, task, user, repo)).toEqual({ kind: 'waiting' });
        expect(get).not.toHaveBeenCalled();
        approval.status = 'executing';
        approval.executionStartedAt = new Date().toISOString();
        get.mockRejectedValue({ statusCode: 404 });
        expect(await adapter.reconcile(f.scope, task, user, repo)).toEqual({ kind: 'waiting' });
        approval.executionStartedAt = new Date(Date.now() - 6 * 60000).toISOString();
        expect(await adapter.reconcile(f.scope, task, user, repo)).toEqual({ kind: 'failed', unknown: true });
    });
    it('erro conhecido persistido da aprovação não vira unknown nem expõe payload', async () => {
        const p = plan('propose_video', { prompt: 'Vídeo de produto', visual: 'Mesa branca' }), task = p.tasks[0];
        task.approvalId = task.id;
        const repo = f.factory(f.tenantId, f.userId);
        await repo.createApproval(f.conversationId, task.id, { path: '/api/studio/video/jobs', body: {} });
        Object.assign(f.approvals.get(task.id)!, { status: 'failed', result: { code: 'VIDEO_NOT_IN_PLAN', error: 'payload privado que não deve sair' } });
        expect(await adapter.reconcile(f.scope, task, await repo.currentIdentity(), repo)).toEqual({ kind: 'failed', code: 'VIDEO_NOT_IN_PLAN' });
        expect(get).not.toHaveBeenCalled();
    });
    it('pending/unknown síncrono jamais repete ou conclui', async () => {
        const p = plan('propose_image', { prompt: 'Produto na mesa branca', model: 'black-forest-labs/flux.2-pro' }), task = p.tasks[0];
        task.approvalId = task.id;
        const repo = f.factory(f.tenantId, f.userId);
        await repo.createApproval(f.conversationId, task.id, { path: '/api/studio/ai/generate-image', body: {} });
        const user = await repo.currentIdentity();
        expect(await adapter.reconcile(f.scope, task, user, repo)).toEqual({ kind: 'waiting' });
        f.approvals.get(task.id)!.status = 'unknown';
        expect(await adapter.reconcile(f.scope, task, user, repo)).toMatchObject({ kind: 'failed', unknown: true });
        expect(get).not.toHaveBeenCalled();
    });
    it('imagem completed precisa asset persistido, não apenas rótulo', async () => {
        const p = plan('propose_image', { prompt: 'Produto na mesa branca', model: 'black-forest-labs/flux.2-pro' }), task = p.tasks[0];
        task.approvalId = task.id;
        const repo = f.factory(f.tenantId, f.userId);
        await repo.createApproval(f.conversationId, task.id, { path: '/api/studio/ai/generate-image', body: {} });
        Object.assign(f.approvals.get(task.id)!, { status: 'completed', result: { creativeAssetId: imageId } });
        const user = await repo.currentIdentity();
        expect(await adapter.reconcile(f.scope, task, user, repo)).toMatchObject({ kind: 'failed', unknown: true });
        resources.asset.mockResolvedValue({ id: imageId, type: 'image', url: 'https://owned.test/image.png' });
        expect(await adapter.reconcile(f.scope, task, user, repo)).toMatchObject({ kind: 'completed', result: { reference: { id: imageId } } });
    });
});
