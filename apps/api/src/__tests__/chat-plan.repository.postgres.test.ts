/* Funcionalidade: estado persistido de planos em Postgres descartável.
 * Cenário: Dado conversa privada, quando outro tenant/usuário acessa, então não revela nem altera.
 * Cenário: Dado versão compartilhada, quando duas aprovações concorrem, então apenas uma vence.
 * Cenário: Dado proposta, quando transação falha, então aprovação e tarefa voltam juntas.
 * Cenário: Dado usuário removido, quando executar, então a identidade atual é negada.
 */
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import express from 'express';
import request from 'supertest';
import { generateAccessToken } from '../lib/jwt.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { ChatPlanService } from '../services/chat/chat-plan.service.js';
import { ChatPlanController } from '../controllers/chat-plan.controller.js';
import { createChatPlanRouter } from '../routes/chat-plan.routes.js';
import { ChatApprovalRepository } from '../repository/chat-approval.repository.js';
import { ChatPlanRepository, ChatPlanRecoveryRepository } from '../repository/chat-plan.repository.js';
import { newPlan, parsePlanInput } from '../services/chat/chat-plan.domain.js';
const url = process.env.CHAT_PLAN_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const tenant = randomUUID(), user = randomUUID(), other = randomUUID(), conversation = randomUUID();
let sql: ReturnType<typeof postgres>, repo: ChatPlanRepository;
const schema = `chat_plan_${randomUUID().replaceAll('-', '')}`;
const draft = () => newPlan(conversation, parsePlanInput({ title: 'Plano', goal: 'Consultar marca', tasks: [{ key: 'marca', title: 'Marca', capability: 'read_brand', parameters: {}, dependsOn: [] }] }));
suite('repository real', () => {
    beforeAll(async () => {
        const u = new URL(url!);
        if (u.hostname !== '127.0.0.1' || !u.pathname.endsWith('_isolated'))
            throw Error('Somente DB descartável explícito');
        sql = postgres(url!, { max: 6, onnotice: () => {
            }, connection: { search_path: schema } });
        await sql.unsafe(`CREATE SCHEMA ${schema}; CREATE TABLE tenants(id uuid PRIMARY KEY, deleted_at timestamptz); CREATE TABLE users(id uuid PRIMARY KEY,tenant_id uuid,email text,role text,deleted_at timestamptz);`);
        for (const file of ['0059_chat.sql', '0060_chat_approvals.sql', '0062_chat_approval_result.sql', '0063_chat_approval_display.sql', '0067_chat_approval_unknown.sql', '0066_chat_response_runs.sql', '0071_chat_plans.sql', '0073_chat_plan_run_fencing.sql'])
            await sql.unsafe(await readFile(new URL(`../../../../packages/db/migrations/${file}`, import.meta.url), 'utf8'));
        await sql `INSERT INTO tenants VALUES (${tenant},null)`;
        await sql `INSERT INTO users VALUES (${user},${tenant},'test@example.test','member',null),(${other},${tenant},'other@example.test','member',null)`;
        await sql `INSERT INTO chat_conversations(id,tenant_id,user_id,title) VALUES (${conversation},${tenant},${user},'test')`;
        repo = new ChatPlanRepository(tenant, user, drizzle(sql) as never);
    });
    afterAll(async () => {
        if (sql) {
            await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
            await sql.end();
        }
    });
    it('rejects an expired run before creating a plan', async () => {
        const message = randomUUID(), run = randomUUID(), lease = randomUUID();
        await sql`INSERT INTO chat_messages(id,conversation_id,role,content) VALUES (${message},${conversation},'user','test')`;
        await sql`INSERT INTO chat_response_runs(id,conversation_id,user_message_id,lease_id,status,lease_until) VALUES (${run},${conversation},${message},${lease},'running',clock_timestamp()-interval '1 second')`;
        const p = draft();
        await expect(repo.create(p, { runId: run, leaseId: lease, key: 'same', payloadHash: 'same' })).rejects.toMatchObject({ statusCode: 409 });
        expect(await sql`SELECT id FROM chat_plans WHERE id=${p.id}`).toHaveLength(0);
        await sql`UPDATE chat_response_runs SET status='interrupted' WHERE id=${run}`;
    });
    it('serializes concurrent identical requests and returns one persisted plan', async () => {
        const message = randomUUID(), run = randomUUID(), lease = randomUUID();
        await sql`INSERT INTO chat_messages(id,conversation_id,role,content) VALUES (${message},${conversation},'user','test')`;
        await sql`INSERT INTO chat_response_runs(id,conversation_id,user_message_id,lease_id,status,lease_until) VALUES (${run},${conversation},${message},${lease},'running',clock_timestamp()+interval '1 minute')`;
        const fence = { runId: run, leaseId: lease, key: 'same', payloadHash: 'same' };
        const plans = await Promise.all([repo.create(draft(), fence), repo.create(draft(), fence)]);
        expect(plans[0].id).toBe(plans[1].id);
        expect((await repo.create(draft(), fence)).id).toBe(plans[0].id);
        expect(await sql`SELECT plan_id FROM chat_plan_run_requests WHERE run_id=${run}`).toHaveLength(1);
        await sql`UPDATE chat_response_runs SET status='completed' WHERE id=${run}`;
    });
    it('HTTP retains one plan across concurrent delivery and rejects expired credentials', async () => {
        const message = randomUUID(), run = randomUUID(), lease = randomUUID();
        await sql`INSERT INTO chat_messages(id,conversation_id,role,content) VALUES (${message},${conversation},'user','test')`;
        await sql`INSERT INTO chat_response_runs(id,conversation_id,user_message_id,lease_id,status,lease_until) VALUES (${run},${conversation},${message},${lease},'running',clock_timestamp()+interval '1 minute')`;
        const service = new ChatPlanService((t, u) => new ChatPlanRepository(t, u, drizzle(sql) as never), { enqueue: async () => {} }, { authorize: async () => ({ userId: user, tenantId: tenant, email: 'test@example.test', role: 'member' }) });
        const app = express();
        app.use(express.json());
        app.use('/api/chat', createChatPlanRouter(new ChatPlanController(service), { delegationSecret: 'isolated-plan-delegation-secret-not-production' }));
        app.use(errorHandler);
        const token = generateAccessToken({ userId: user, tenantId: tenant, email: 'test@example.test', role: 'member' });
        const body = { title: 'HTTP plano', goal: 'Consultar marca', tasks: [{ key: 'marca', title: 'Marca', capability: 'read_brand', parameters: {}, dependsOn: [] }] };
        const post = (operation = 'call-1', payload = body) => request(app).post(`/api/chat/conversations/${conversation}/plans/from-run`).auth(token, { type: 'bearer' }).set('x-chat-run-id', run).set('x-chat-run-lease', lease).set('x-chat-operation-id', operation).send(payload);
        const [a, b] = await Promise.all([post(), post()]);
        expect([a.status, b.status]).toEqual([201, 201]);
        expect(a.body.plan.id).toBe(b.body.plan.id);
        expect((await post()).body.plan.id).toBe(a.body.plan.id);
        const second = await post('call-2');
        expect(second.status).toBe(201);
        expect(second.body.plan.id).not.toBe(a.body.plan.id);
        expect((await post('call-1', { ...body, goal: 'Outro objetivo' })).status).toBe(409);
        expect((await request(app).post(`/api/chat/conversations/${conversation}/plans/from-run`).auth(token, { type: 'bearer' }).send(body)).status).toBe(400);
        expect((await request(app).post(`/api/chat/conversations/${conversation}/plans/from-run`).auth(token, { type: 'bearer' }).set('x-chat-run-id', run).set('x-chat-run-lease', randomUUID()).set('x-chat-operation-id', 'call-1').send(body)).status).toBe(409);
        expect(await sql`SELECT id FROM chat_plans WHERE title='HTTP plano'`).toHaveLength(2);
        await sql`UPDATE chat_response_runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${run}`;
        expect((await post()).status).toBe(409);
        expect(await sql`SELECT id FROM chat_plans WHERE title='HTTP plano'`).toHaveLength(2);
        await sql`UPDATE chat_response_runs SET status='interrupted' WHERE id=${run}`;
    });
    it('rechecks expiry after waiting for the conversation lock', async () => {
        const message = randomUUID(), run = randomUUID(), lease = randomUUID();
        await sql`INSERT INTO chat_messages(id,conversation_id,role,content) VALUES (${message},${conversation},'user','test')`;
        await sql`INSERT INTO chat_response_runs(id,conversation_id,user_message_id,lease_id,status,lease_until) VALUES (${run},${conversation},${message},${lease},'running',clock_timestamp()+interval '200 milliseconds')`;
        const p = draft();
        let pending!: Promise<unknown>;
        await sql.begin(async tx => {
            await tx`SELECT id FROM chat_conversations WHERE id=${conversation} FOR UPDATE`;
            pending = repo.create(p, { runId: run, leaseId: lease, key: 'blocked', payloadHash: 'blocked' });
            // Attach rejection handler before releasing the lock.
            void pending.catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 350));
        });
        await expect(pending).rejects.toMatchObject({ statusCode: 409 });
        expect(await sql`SELECT id FROM chat_plans WHERE id=${p.id}`).toHaveLength(0);
        await sql`UPDATE chat_response_runs SET status='interrupted' WHERE id=${run}`;
    });
    it('não revela nem altera dados de outro owner', async () => {
        const p = await repo.create(draft());
        expect((await repo.list(conversation)).some(plan => plan.id === p.id)).toBe(true);
        for (const r of [new ChatPlanRepository(tenant, other, drizzle(sql) as never), new ChatPlanRepository(randomUUID(), user, drizzle(sql) as never)]) {
            await expect(r.get(conversation, p.id)).rejects.toMatchObject({ statusCode: 404 });
            await expect(r.mutate(conversation, p.id, 1, p => {
                p.status = 'running';
            })).rejects.toMatchObject({ statusCode: 404 });
        }
    });
    it('CAS concorrente permite uma aprovação', async () => {
        const p = await repo.create(draft());
        const out = await Promise.allSettled([1, 2].map(() => repo.mutate(conversation, p.id, 1, p => {
            p.status = 'running';
        })));
        expect(out.filter(x => x.status === 'fulfilled')).toHaveLength(1);
        expect(out.find(x => x.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } });
        expect((await repo.get(conversation, p.id)).version).toBe(2);
    });
    it('aprovação e vínculo atômicos, idempotentes, scoped', async () => {
        const p = await repo.create(draft());
        const spec = { path: '/api/studio/ai/generate-image', body: { prompt: 'test' } };
        await expect(repo.mutate(conversation, p.id, 1, async (p, tx) => {
            await tx.createApproval(conversation, p.tasks[0].id, spec);
            throw Error('rollback');
        })).rejects.toThrow('rollback');
        expect(await repo.readApproval(conversation, p.tasks[0].id)).toBeUndefined();
        await repo.mutate(conversation, p.id, 1, async (p, tx) => {
            p.tasks[0].approvalId = await tx.createApproval(conversation, p.tasks[0].id, spec);
            p.tasks[0].status = 'waiting_approval';
        });
        expect(await repo.readApproval(conversation, p.tasks[0].id)).toMatchObject({ status: 'pending', path: spec.path });
        expect(await new ChatPlanRepository(tenant, other, drizzle(sql) as never).readApproval(conversation, p.tasks[0].id)).toBeUndefined();
    });
    it('gate existente não consome pending, outro owner nem payload diferente; cancel não aborta executing', async () => {
        const p = await repo.create(draft()), id = p.tasks[0].id, spec = { path: '/api/studio/ai/generate-image' as const, body: { prompt: 'Contrato real' } };
        await repo.mutate(conversation, p.id, 1, async (p, tx) => {
            p.tasks[0].approvalId = await tx.createApproval(conversation, id, spec);
        });
        const gate = new ChatApprovalRepository(tenant, drizzle(sql) as never);
        const action = { approvalId: id, userId: user, tenantId: tenant, method: 'POST', ...spec };
        expect(await gate.consume(action)).toBe(false);
        await sql `UPDATE chat_approvals SET status='approved' WHERE id=${id}`;
        expect(await gate.consume({ ...action, userId: other })).toBe(false);
        expect(await gate.consume({ ...action, body: { prompt: 'Alterado' } })).toBe(false);
        expect(await gate.consume(action)).toBe(true);
        expect(await gate.consume(action)).toBe(false);
        expect(await repo.cancelPendingApproval(conversation, id)).toBe(false);
        expect((await repo.readApproval(conversation, id))?.status).toBe('executing');
    });
    it('cancelamento pendente bloqueia confirmação e é scoped', async () => {
        const p = await repo.create(draft()), id = p.tasks[0].id;
        await repo.createApproval(conversation, id, { path: '/api/studio/video/jobs', body: {} });
        expect(await new ChatPlanRepository(tenant, other, drizzle(sql) as never).cancelPendingApproval(conversation, id)).toBe(false);
        expect(await repo.cancelPendingApproval(conversation, id)).toBe(true);
        expect(await repo.cancelPendingApproval(conversation, id)).toBe(false);
        expect((await repo.readApproval(conversation, id))?.status).toBe('cancelled');
    });
    it('recovery não enfileira espera manual indefinidamente', async () => {
        const p = await repo.create(draft());
        await repo.mutate(conversation, p.id, 1, p => {
            p.status = 'waiting_approval';
            p.tasks[0].capability = 'manual';
            p.tasks[0].parameters = { instructions: 'Revisar' };
            p.tasks[0].status = 'waiting_approval';
        });
        const rows = await new ChatPlanRecoveryRepository(drizzle(sql) as never).listRecoverable();
        expect(rows.some(r => r.planId === p.id)).toBe(false);
    });
    it('usuário revogado é revalidado', async () => {
        expect(await repo.currentIdentity()).toMatchObject({ userId: user, tenantId: tenant });
        await sql `UPDATE users SET deleted_at=now() WHERE id=${user}`;
        await expect(repo.currentIdentity()).rejects.toMatchObject({ statusCode: 403 });
        await sql `UPDATE users SET deleted_at=null WHERE id=${user}`;
    });
});
