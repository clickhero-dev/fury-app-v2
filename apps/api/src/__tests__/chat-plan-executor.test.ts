/* Funcionalidade: executor limitado, com evidência e gate humano.
 * Cenário: Dado DAG aprovado, quando dois workers disputam, então executam um único passo.
 * Cenário: Dado proposta nova, quando enfileira, então aguarda aprovação sem concluir.
 * Cenário: Dado restart após efeito, quando recuperar, então não repete ação incerta.
 * Cenário: Dado resultado desconhecido, quando continuar, então só reconcilia.
 * Cenário: Dado falha transitória segura, quando repetir, então limita a duas tentativas.
 * Cenário: Dado pause/cancel/revogação, quando terminar a chamada, então não inicia próximo passo.
 */
import { beforeEach, describe, it, expect, vi, type Mock } from 'vitest';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { planMemoryFixture } from './chat-plan.fixtures.js';
import { newPlan, parsePlanInput, changePlan } from '../services/chat/chat-plan.domain.js';
import { ChatPlanExecutor, PlanStepError } from '../services/chat/chat-plan-executor.js';
let f: ReturnType<typeof planMemoryFixture>, executor: ChatPlanExecutor, execute: Mock<any[], Promise<any>>, reconcile: Mock<any[], Promise<any>>, enqueue: Mock<any[], Promise<any>>, now: number;
const inputs = (capability = 'read_brand', parameters = {}) => ({ title: 'Plano', goal: 'Consultar', tasks: [{ key: 'one', title: 'Um', capability, parameters, dependsOn: [] }, { key: 'two', title: 'Dois', capability: 'read_brand', parameters: {}, dependsOn: ['one'] }] });
async function start(capability = 'read_brand', parameters = {}) {
    const p = newPlan(f.conversationId, parsePlanInput(inputs(capability, parameters)));
    changePlan(p, 'approve', 'human');
    await f.factory(f.tenantId, f.userId).create(p);
    return { ...f.scope, planId: p.id, version: p.version };
}
const current = (id: string) => f.factory(f.tenantId, f.userId).get(f.conversationId, id);
beforeEach(() => {
    f = planMemoryFixture();
    now = Date.now();
    execute = vi.fn(async () => ({ kind: 'completed', result: { summary: 'Marca consultada', data: { primaryColor: '#ffffff' } } }));
    reconcile = vi.fn(async () => ({ kind: 'waiting' }));
    enqueue = vi.fn(async () => {
    });
    executor = new ChatPlanExecutor(f.factory, { execute, reconcile }, { authorize: async () => f.factory(f.tenantId, f.userId).currentIdentity() }, { enqueue }, () => now);
});
describe('executor real com portas isoladas', () => {
    it('draft nunca executa', async () => {
        const w = await start();
        f.plans.get(w.planId)!.status = 'draft';
        await executor.run(w);
        expect(execute).not.toHaveBeenCalled();
    });
    it('dois workers executam uma vez e respeitam dependências', async () => {
        const w = await start();
        await Promise.all([executor.run(w), executor.run(w)]);
        expect(execute).toHaveBeenCalledTimes(1);
        let p = await current(w.planId);
        expect(p.tasks.map(t => t.status)).toEqual(['completed', 'pending']);
        await executor.run({ ...w, version: p.version });
        p = await current(w.planId);
        expect(p.status).toBe('completed');
        expect(execute).toHaveBeenCalledTimes(2);
    });
    it('proposta vinculada permanece waiting_approval até resultado verificado', async () => {
        execute.mockResolvedValue({ kind: 'proposal', proposal: { path: '/api/studio/video/jobs', body: { prompt: 'Cenário real' } } });
        const w = await start('propose_video', { prompt: 'Vídeo de teste', visual: 'Mesa de trabalho' });
        await executor.run(w);
        let p = await current(w.planId);
        expect(p.status).toBe('waiting_approval');
        expect(p.tasks[0].approvalId).toBeDefined();
        await executor.run({ ...w, version: p.version });
        expect(execute).toHaveBeenCalledTimes(1);
        expect(p.tasks[1].status).toBe('pending');
        now += 61000;
        reconcile.mockResolvedValue({ kind: 'completed', result: { reference: { kind: 'asset', id: 'verified' } } });
        await executor.run(w);
        p = await current(w.planId);
        expect(p.tasks[0].status).toBe('completed');
        expect(p.tasks[1].status).toBe('pending');
    });
    it('restart em draft_text interrompido é unknown e não gasta novamente', async () => {
        const w = await start('draft_text', { prompt: 'Crie um texto' });
        const p = f.plans.get(w.planId)!;
        Object.assign(p.tasks[0], { status: 'running', attempts: 1, fence: 'old', leaseUntil: new Date(now - 1).toISOString() });
        await executor.run(w);
        expect(execute).not.toHaveBeenCalled();
        expect((await current(w.planId)).tasks[0]).toMatchObject({ status: 'failed', failure: 'unknown' });
    });
    it('unknown de aprovação impede dependentes e não recria proposta', async () => {
        execute.mockResolvedValue({ kind: 'proposal', proposal: { path: '/api/studio/video/jobs', body: {} } });
        const w = await start('propose_video', { prompt: 'Vídeo de teste', visual: 'Mesa' });
        await executor.run(w);
        now += 61000;
        reconcile.mockResolvedValue({ kind: 'failed', unknown: true });
        await executor.run(w);
        const p = await current(w.planId);
        expect(p.status).toBe('failed');
        changePlan(p, 'resume', 'human');
        f.plans.set(p.id, p);
        now += 61000;
        await executor.run(w);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(reconcile).toHaveBeenCalledTimes(2);
    });
    it('read seguro só tenta duas vezes com backoff; erro não vaza', async () => {
        execute.mockRejectedValue(new PlanStepError('transient'));
        const w = await start();
        await executor.run(w);
        await executor.run(w);
        expect(execute).toHaveBeenCalledTimes(1);
        now += 3000;
        await executor.run(w);
        now += 3000;
        await executor.run(w);
        expect(execute).toHaveBeenCalledTimes(2);
        expect((await current(w.planId)).status).toBe('failed');
    });
    it.each(['pause', 'cancel'] as const)('%s durante chamada mantém resultado sem iniciar dependentes', async (action) => {
        const w = await start();
        execute.mockImplementation(async () => {
            await f.factory(f.tenantId, f.userId).mutate(f.conversationId, w.planId, undefined, p => changePlan(p, action, 'human'));
            return { kind: 'completed', result: { summary: 'Leitura verificada' } };
        });
        await executor.run(w);
        const p = await current(w.planId);
        expect(p.status).toBe(action === 'pause' ? 'paused' : 'cancelled');
        expect(p.tasks[0].status).toBe('completed');
        await executor.run(w);
        expect(execute).toHaveBeenCalledTimes(1);
    });
    it('revogação impede qualquer execução', async () => {
        const w = await start();
        f.revoke();
        await executor.run(w);
        expect(execute).not.toHaveBeenCalled();
        expect((await current(w.planId)).status).toBe('failed');
    });
    it('tarefa manual aguarda humano sem provider nem repetição', async () => {
        const w = await start('manual', { instructions: 'Revisar' });
        await executor.run(w);
        await executor.run(w);
        expect(execute).not.toHaveBeenCalled();
        expect((await current(w.planId)).tasks[0].status).toBe('waiting_approval');
    });
    it('vídeo indisponível explica motivo sem approval nem falso waiting', async () => {
        execute.mockRejectedValue(new PlanStepError('video_not_in_plan'));
        const w = await start('propose_video', { prompt: 'Vídeo do produto', visual: 'Mesa branca' });
        await executor.run(w);
        const p = await current(w.planId);
        expect(p.status).toBe('failed');
        expect(p.tasks[0].error).toBe('Seu plano não inclui criação de vídeo.');
        expect(p.tasks[0].approvalId).toBeUndefined();
        expect(f.approvals.size).toBe(0);
    });
    it('erro conhecido da aprovação apresenta mensagem legível, sem payload privado', async () => {
        execute.mockResolvedValue({ kind: 'proposal', proposal: { path: '/api/studio/video/jobs', body: {} } });
        const w = await start('propose_video', { prompt: 'Vídeo do produto', visual: 'Mesa branca' });
        await executor.run(w);
        now += 61000;
        reconcile.mockResolvedValue({ kind: 'failed', code: 'VIDEO_NOT_IN_PLAN' });
        await executor.run(w);
        expect((await current(w.planId)).tasks[0]).toMatchObject({ status: 'failed', failure: 'permanent', error: 'Seu plano não inclui criação de vídeo.' });
    });
    it('retomada humana permite reconciliar unknown depois do limite anterior, sem repetir efeito', async () => {
        execute.mockResolvedValue({ kind: 'proposal', proposal: { path: '/api/studio/video/jobs', body: {} } });
        const w = await start('propose_video', { prompt: 'Vídeo do produto', visual: 'Mesa branca' });
        await executor.run(w);
        now += 26 * 3600000;
        await executor.run(w);
        const p = await current(w.planId);
        expect(p.status).toBe('failed');
        p.tasks[0].waitUntil = new Date(Date.now() - 1).toISOString();
        changePlan(p, 'resume', 'human');
        f.plans.set(p.id, p);
        now = Date.now();
        reconcile.mockResolvedValue({ kind: 'completed', result: { reference: { kind: 'asset', id: 'verified' } } });
        await executor.run(w);
        expect(reconcile).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledTimes(1);
    });
    it('espera expirada falha sem polling infinito', async () => {
        execute.mockResolvedValue({ kind: 'proposal', proposal: { path: '/api/studio/video/jobs', body: {} } });
        const w = await start('propose_video', { prompt: 'Vídeo de teste', visual: 'Mesa' });
        await executor.run(w);
        now += 2 * 86400000;
        await executor.run(w);
        expect((await current(w.planId)).status).toBe('failed');
        expect(execute).toHaveBeenCalledTimes(1);
    });
});
