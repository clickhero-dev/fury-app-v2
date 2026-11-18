import { describe, it, expect, vi } from 'vitest';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { changePlan, newPlan, parsePlanInput } from '../services/chat/chat-plan.domain.js';
import { ChatPlanCapabilities } from '../services/chat/chat-plan-capabilities.js';
import { ChatPlanExecutor } from '../services/chat/chat-plan-executor.js';
import { planMemoryFixture } from './chat-plan.fixtures.js';

const ref = (task: string, field = 'text') => ({ $result: { task, field } });
const task = (key: string, capability: string, parameters: Record<string, unknown>, dependsOn: string[] = []) => ({ key, title: key, capability, parameters, dependsOn });
const input = () => ({ title: 'Ideia até agendamento', goal: 'Reaproveitar artefatos', tasks: [
    task('idea', 'draft_text', { prompt: 'Crie uma ideia' }),
    task('caption', 'draft_text', { prompt: ref('idea') }, ['idea']),
    task('art', 'propose_image', { prompt: ref('caption'), model: 'black-forest-labs/flux.2-pro' }, ['caption']),
    task('review', 'manual', { instructions: 'Revise texto e arte antes de agendar.' }, ['art', 'caption']),
    task('post', 'propose_post', { caption: ref('caption'), image_url: ref('art', 'assetUrl'), post_type: 'image', scheduled_at: '2099-11-10T15:00:00Z' }, ['review', 'caption', 'art']),
] });
const assetId = '11111111-1111-4111-8111-111111111111';

describe('referências fechadas de resultados anteriores', () => {
    it('preserva referências no contrato persistido, sem placeholders', () => {
        const p = parsePlanInput(input());
        expect(p.tasks[4].parameters.image_url).toEqual(ref('art', 'assetUrl'));
        expect(p.tasks[2].parameters).toMatchObject({ prompt: ref('caption'), resolution: '2K' });
    });
    it.each([
        ['sem dependência direta', (p: ReturnType<typeof input>) => { p.tasks[4].dependsOn = ['review']; }],
        ['tarefa futura', (p: ReturnType<typeof input>) => { p.tasks[0].parameters.prompt = ref('caption'); p.tasks[0].dependsOn = ['caption']; p.tasks[1].dependsOn = []; }],
        ['campo arbitrário', (p: ReturnType<typeof input>) => { p.tasks[4].parameters.caption = ref('caption', 'summary'); }],
        ['capacidade incompatível', (p: ReturnType<typeof input>) => { p.tasks[4].parameters.caption = ref('art'); }],
        ['tipo mídia incompatível', (p: ReturnType<typeof input>) => { p.tasks[4].parameters.post_type = 'reel'; }],
        ['campo literal inválido junto de binding', (p: ReturnType<typeof input>) => { p.tasks[2].parameters.model = 'bad'; }],
        ['binding extra', (p: ReturnType<typeof input>) => { p.tasks[4].parameters.image_url = { ...ref('art', 'assetUrl'), url: 'https://evil.test/x.png' }; }],
        ['binding aninhado proibido', (p: ReturnType<typeof input>) => { p.tasks[2].parameters.reference_image_urls = [ref('caption')]; }],
        ['origem inexistente', (p: ReturnType<typeof input>) => { p.tasks[4].parameters.caption = ref('missing'); }],
        ['alvo proibido', (p: ReturnType<typeof input>) => { p.tasks[3].parameters.instructions = ref('caption'); }],
        ['carousel não aceita referência única', (p: ReturnType<typeof input>) => { p.tasks[4].parameters.post_type = 'carousel'; }],
    ])('rejeita %s na criação', (_name, edit) => {
        const p = input(); edit(p); expect(() => parsePlanInput(p)).toThrow();
    });
    it('encadeia executores reais sem pular aprovação da arte, revisão e agendamento', async () => {
        const f = planMemoryFixture(), repo = f.factory(f.tenantId, f.userId);
        const p = newPlan(f.conversationId, parsePlanInput(input()));
        changePlan(p, 'approve', 'human');
        await repo.create(p);
        const wake = { ...f.scope, planId: p.id, version: p.version };
        let now = Date.now();
        const resource = { id: assetId, type: 'image', url: 'https://owned.test/art.png' };
        const text = vi.fn().mockResolvedValueOnce('Ideia inicial concreta').mockResolvedValueOnce('Legenda final concreta');
        const adapter = new ChatPlanCapabilities({ get: vi.fn(), text, resources: () => ({ asset: async () => resource, assetByUrl: async () => resource } as any), videoOptions: vi.fn() });
        const executor = new ChatPlanExecutor(f.factory, adapter, { authorize: async () => repo.currentIdentity() }, { enqueue: vi.fn() }, () => now);
        await executor.run(wake); // idea
        await executor.run(wake); // caption uses actual idea
        expect(text.mock.calls[1][1]).toBe('Ideia inicial concreta');
        await executor.run(wake); // image proposal
        const artApproval = f.approvals.get(p.tasks[2].id)!;
        expect(artApproval.body.prompt).toBe('Legenda final concreta');
        expect(artApproval.status).toBe('pending');
        await executor.run(wake);
        expect((await repo.get(f.conversationId, p.id)).tasks[3].status).toBe('pending');
        artApproval.status = 'completed';
        artApproval.result = { assetId };
        now += 61000;
        await executor.run(wake); // reconcile saved asset
        await executor.run(wake); // manual review gate
        expect((await repo.get(f.conversationId, p.id)).tasks[3].status).toBe('waiting_approval');
        await executor.run(wake);
        expect(f.approvals.size).toBe(1);
        await repo.mutate(f.conversationId, p.id, undefined, plan => changePlan(plan, 'complete', 'human', p.tasks[3].id));
        await executor.run(wake);
        const postApproval = f.approvals.get(p.tasks[4].id)!;
        expect(postApproval.body).toMatchObject({ caption: 'Legenda final concreta', imageUrl: resource.url });
        expect(postApproval.status).toBe('pending');
        expect((await repo.get(f.conversationId, p.id)).tasks[4].status).toBe('waiting_approval');
    });
    it.each(['reel', 'stories'])('resolve asset de vídeo confirmado para %s', async postType => {
        const f = planMemoryFixture(), value = input();
        value.tasks[2] = task('art', 'propose_video', { prompt: ref('caption'), visual: 'Mesa de produtos' }, ['caption']);
        value.tasks[4].parameters.post_type = postType;
        const p = newPlan(f.conversationId, parsePlanInput(value));
        Object.assign(p.tasks[1], { status: 'completed', result: { text: 'Legenda do vídeo' } });
        Object.assign(p.tasks[2], { status: 'completed', result: { reference: { kind: 'asset', id: assetId } } });
        const a = { id: assetId, type: 'video', url: 'https://owned.test/art.mp4' };
        const adapter = new ChatPlanCapabilities({ get: vi.fn(), text: vi.fn(), resources: () => ({ asset: async () => a, assetByUrl: async () => a } as any), videoOptions: vi.fn() });
        expect(await adapter.execute(f.scope, p, p.tasks[4], await f.factory(f.tenantId, f.userId).currentIdentity())).toMatchObject({ kind: 'proposal', proposal: { body: { imageUrl: a.url, postType } } });
    });
    it('resolve texto e asset pelo tenant atual, nunca URL fornecida pelo resultado', async () => {
        const f = planMemoryFixture();
        const p = newPlan(f.conversationId, parsePlanInput(input()));
        Object.assign(p.tasks[1], { status: 'completed', result: { text: 'Legenda aprovada de verdade' } });
        Object.assign(p.tasks[2], { status: 'completed', result: { reference: { kind: 'asset', id: assetId }, data: { assetUrl: 'https://evil.test/x.png' } } });
        p.tasks[3].status = 'completed';
        const asset = vi.fn(async () => ({ id: assetId, type: 'image', url: 'https://owned.test/real.png' }));
        const assetByUrl = vi.fn(async () => ({ id: assetId, type: 'image', url: 'https://owned.test/real.png' }));
        const resources = vi.fn(() => ({ asset, assetByUrl } as any));
        const text = vi.fn(async () => 'Texto de saída');
        const adapter = new ChatPlanCapabilities({ get: vi.fn(), text, resources, videoOptions: vi.fn() });
        const user = await f.factory(f.tenantId, f.userId).currentIdentity();
        expect(await adapter.execute(f.scope, p, p.tasks[4], user)).toMatchObject({ kind: 'proposal', proposal: { body: { caption: 'Legenda aprovada de verdade', imageUrl: 'https://owned.test/real.png' } } });
        expect(resources).toHaveBeenCalledWith(f.tenantId);
        expect(asset).toHaveBeenCalledWith(assetId);
        expect(JSON.stringify(p.tasks[4].parameters)).not.toContain('owned.test');
        expect(await adapter.execute(f.scope, p, p.tasks[2], user)).toMatchObject({ kind: 'proposal', proposal: { body: { prompt: 'Legenda aprovada de verdade' } } });
        expect(text).not.toHaveBeenCalled();
    });
    it.each(['pending', 'missing', 'oversized', 'short', 'foreign', 'deleted', 'wrongType', 'wrongId', 'badUrl', 'badRef'])('falha fechada em %s sem proposta externa', async mode => {
        const f = planMemoryFixture(), p = newPlan(f.conversationId, parsePlanInput(input()));
        Object.assign(p.tasks[1], { status: 'completed', result: { text: 'Legenda concreta' } });
        Object.assign(p.tasks[2], { status: 'completed', result: { reference: { kind: 'asset', id: assetId } } });
        p.tasks[3].status = 'completed';
        if (mode === 'pending') p.tasks[1].status = 'pending';
        if (mode === 'missing') p.tasks[1].result = {};
        if (mode === 'oversized') p.tasks[1].result = { text: 'x'.repeat(5001) };
        if (mode === 'short') p.tasks[1].result = { text: 'x' };
        if (mode === 'badRef') p.tasks[2].result = { reference: { kind: 'post', id: assetId } };
        const a = { id: mode === 'wrongId' ? 'other' : assetId, type: mode === 'wrongType' ? 'video' : 'image', url: mode === 'badUrl' ? 'http://unsafe.test/x.png' : 'https://owned.test/x.png', deletedAt: mode === 'deleted' ? new Date() : null };
        const adapter = new ChatPlanCapabilities({ get: vi.fn(), text: vi.fn(), resources: () => ({ asset: async () => mode === 'foreign' ? null : a, assetByUrl: async () => a } as any), videoOptions: vi.fn() });
        const user = await f.factory(f.tenantId, f.userId).currentIdentity();
        await expect(adapter.execute(f.scope, p, p.tasks[mode === 'short' ? 2 : 4], user)).rejects.toThrow();
    });
});
