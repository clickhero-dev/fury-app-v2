/* Funcionalidade: API privada de planos, com aprovação humana obrigatória.
 * Cenário: Dado humano ou chat autenticado, quando propõe, então cria draft e lista.
 * Cenário: Dado input inválido/sem token/outro owner, quando acessar, então 400/401/404.
 * Cenário: Dado chat autenticado, quando aprova, então 403 sem fila.
 * Cenário: Dado dois cliques concorrentes, quando aprova mesma versão, então 200+409 e um enqueue.
 * Cenário: Dado falha da fila após CAS, quando consulta, então estado persiste para recovery.
 */
import { beforeEach, describe, it, expect, vi, type Mock } from 'vitest';
import express from 'express';
import request from 'supertest';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { generateAccessToken } from '../lib/jwt.js';
import { createChatDelegation } from '../lib/chat-delegation.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { ChatPlanService } from '../services/chat/chat-plan.service.js';
import { ChatPlanController } from '../controllers/chat-plan.controller.js';
import { createChatPlanRouter } from '../routes/chat-plan.routes.js';
import { planMemoryFixture } from './chat-plan.fixtures.js';
const secret = 'isolated-plan-delegation-secret-not-production';
let f: ReturnType<typeof planMemoryFixture>, app: express.Express, token: string, chat: string, base: string, enqueue: Mock<any[], Promise<any>>;
const input = { title: 'Plano da semana', goal: 'Consultar marca', tasks: [{ key: 'marca', title: 'Marca', capability: 'read_brand', parameters: {}, dependsOn: [] }] };
beforeEach(() => {
    f = planMemoryFixture();
    enqueue = vi.fn(async () => {
    });
    const access = { authorize: async (s: typeof f.scope) => f.factory(s.tenantId, s.userId).currentIdentity() };
    const service = new ChatPlanService(f.factory, { enqueue }, access);
    app = express();
    app.use(express.json());
    app.use('/api/chat', createChatPlanRouter(new ChatPlanController(service), { delegationSecret: secret }));
    app.use(errorHandler);
    const user = { ...f.scope, email: 'test@example.test', role: 'member' };
    token = generateAccessToken(user);
    chat = createChatDelegation(user, secret);
    base = `/api/chat/conversations/${f.conversationId}/plans`;
});
const create = async (auth = token) => (await request(app).post(base).auth(auth, { type: 'bearer' }).send(input)).body.plan;
describe('API de planos', () => {
    it('cria draft via chat, lista e lê sem executar', async () => {
        const p = await create(chat);
        expect(p.status).toBe('draft');
        expect(enqueue).not.toHaveBeenCalled();
        expect((await request(app).get(base).auth(token, { type: 'bearer' })).body.plans).toHaveLength(1);
        expect((await request(app).get(`${base}/${p.id}`).auth(token, { type: 'bearer' })).body.plan.id).toBe(p.id);
    });
    it('401 sem token', async () => expect((await request(app).get(base)).status).toBe(401));
    it('400 schema, ids e estado não editáveis', async () => {
        expect((await request(app).post(base).auth(token, { type: 'bearer' }).send({ ...input, status: 'completed' })).status).toBe(400);
        expect((await request(app).get(`${base}/invalid`).auth(token, { type: 'bearer' })).status).toBe(400);
    });
    it('404 para plano/conversa/outro usuário, mesmo tenant', async () => {
        const p = await create();
        const other = generateAccessToken({ userId: '22222222-2222-4222-8222-222222222222', tenantId: f.tenantId, email: 'other@test.example', role: 'member' });
        expect((await request(app).get(`${base}/${p.id}`).auth(other, { type: 'bearer' })).status).toBe(404);
        expect((await request(app).get(`${base}/33333333-3333-4333-8333-333333333333`).auth(token, { type: 'bearer' })).status).toBe(404);
    });
    it.each(['approve', 'pause', 'resume', 'cancel'])('403 chat não executa %s nem forja ator', async (action) => {
        const p = await create();
        const res = await request(app).post(`${base}/${p.id}/${action}`).auth(chat, { type: 'bearer' }).set('x-actor', 'human').send({ version: 1 });
        expect(res.status).toBe(403);
        expect(enqueue).not.toHaveBeenCalled();
    });
    it('403 acesso atualmente revogado', async () => {
        const p = await create();
        f.revoke();
        expect((await request(app).post(`${base}/${p.id}/approve`).auth(token, { type: 'bearer' }).send({ version: 1 })).status).toBe(403);
    });
    it('aprovação concorrente é CAS e enqueue único', async () => {
        const p = await create();
        const responses = await Promise.all([1, 2].map(() => request(app).post(`${base}/${p.id}/approve`).auth(token, { type: 'bearer' }).send({ version: 1 })));
        expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
        expect(enqueue).toHaveBeenCalledTimes(1);
        expect(enqueue.mock.calls[0][0]).not.toHaveProperty('token');
    });
    it('edita só draft; rejeita alteração posterior e versão obsoleta', async () => {
        const p = await create();
        const edited = await request(app).patch(`${base}/${p.id}`).auth(chat, { type: 'bearer' }).send({ version: 1, title: 'Revisado' });
        expect(edited.status).toBe(200);
        expect((await request(app).patch(`${base}/${p.id}`).auth(token, { type: 'bearer' }).send({ version: 1, title: 'Obsoleto' })).status).toBe(409);
        await request(app).post(`${base}/${p.id}/approve`).auth(token, { type: 'bearer' }).send({ version: 2 });
        expect((await request(app).patch(`${base}/${p.id}`).auth(token, { type: 'bearer' }).send({ version: 3, title: 'Perigoso' })).status).toBe(409);
    });
    it('cancelar restantes revoga proposta ainda não executada, sem fingir abort da execução externa', async () => {
        const p = await create();
        const repo = f.factory(f.tenantId, f.userId);
        await repo.createApproval(f.conversationId, p.tasks[0].id, { path: '/api/studio/ai/generate-image', body: {} });
        const waiting = await repo.mutate(f.conversationId, p.id, 1, p => {
            p.status = 'waiting_approval';
            p.tasks[0].status = 'waiting_approval';
            p.tasks[0].approvalId = p.tasks[0].id;
        });
        const res = await request(app).post(`${base}/${p.id}/cancel`).auth(token, { type: 'bearer' }).send({ version: waiting.version });
        expect(res.status).toBe(200);
        expect(f.approvals.get(p.tasks[0].id)?.status).toBe('cancelled');
        expect(res.body.plan.tasks[0].status).toBe('cancelled');
    });
    it('manual exige confirmação humana via endpoint próprio, nunca automático', async () => {
        const res = await request(app).post(base).auth(token, { type: 'bearer' }).send({ ...input, tasks: [{ key: 'manual', title: 'Revisar', capability: 'manual', parameters: { instructions: 'Revise' }, dependsOn: [] }] });
        const p = res.body.plan;
        const url = `${base}/${p.id}/tasks/${p.tasks[0].id}/complete`;
        expect((await request(app).post(url).send({ version: 1 })).status).toBe(401);
        expect((await request(app).post(url).auth(chat, { type: 'bearer' }).send({ version: 1 })).status).toBe(403);
        expect((await request(app).post(url).auth(token, { type: 'bearer' }).send({ version: 1 })).status).toBe(409);
        await request(app).post(`${base}/${p.id}/approve`).auth(token, { type: 'bearer' }).send({ version: 1 });
        expect((await request(app).post(url).auth(token, { type: 'bearer' }).send({ version: 2 })).body.plan.status).toBe('completed');
    });
    it.each(['approve', 'pause', 'resume', 'cancel'])('400/401/404 para transição %s', async (action) => {
        const p = await create();
        const url = `${base}/${p.id}/${action}`;
        expect((await request(app).post(url).send({ version: 1 })).status).toBe(401);
        expect((await request(app).post(url).auth(token, { type: 'bearer' }).send({ version: 0 })).status).toBe(400);
        expect((await request(app).post(`${base}/33333333-3333-4333-8333-333333333333/${action}`).auth(token, { type: 'bearer' }).send({ version: 1 })).status).toBe(404);
    });
    it('pausa e retoma estado persistido sem apagar progresso', async () => {
        const p = await create();
        let r = await request(app).post(`${base}/${p.id}/approve`).auth(token, { type: 'bearer' }).send({ version: 1 });
        r = await request(app).post(`${base}/${p.id}/pause`).auth(token, { type: 'bearer' }).send({ version: r.body.plan.version });
        expect(r.body.plan.status).toBe('paused');
        r = await request(app).post(`${base}/${p.id}/resume`).auth(token, { type: 'bearer' }).send({ version: r.body.plan.version });
        expect(r.body.plan.status).toBe('running');
    });
    it('fila indisponível não perde execução persistida', async () => {
        const p = await create();
        enqueue.mockRejectedValue(Error('redis unavailable'));
        expect((await request(app).post(`${base}/${p.id}/approve`).auth(token, { type: 'bearer' }).send({ version: 1 })).status).toBe(503);
        expect((await f.factory(f.tenantId, f.userId).get(f.conversationId, p.id)).status).toBe('running');
    });
});
