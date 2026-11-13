/* Funcionalidade: executor BullMQ + Postgres isolados sobrevivem a restart.
 * Cenário: Dado dois workers e dois jobs, quando executam, então só há um efeito por etapa.
 * Cenário: Dado plano aprovado sem enqueue, quando recovery roda após restart, então retoma do DB.
 * Cenário: Dado resultado externo incerto após crash, quando worker reinicia, então não repete.
 */
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { ChatPlanRepository, ChatPlanRecoveryRepository } from '../repository/chat-plan.repository.js';
import { newPlan, parsePlanInput, changePlan } from '../services/chat/chat-plan.domain.js';
import { ChatPlanExecutor } from '../services/chat/chat-plan-executor.js';
import { ChatPlanQueue, createChatPlanWorker, CHAT_PLAN_QUEUE_NAME } from '../workers/chat-plan.worker.js';
const url = process.env.CHAT_PLAN_TEST_DATABASE_URL, redis = process.env.CHAT_PLAN_TEST_REDIS_URL;
const suite = url && redis ? describe : describe.skip;
const tenant = randomUUID(), user = randomUUID(), conversation = randomUUID(), schema = `plan_queue_${randomUUID().replaceAll('-', '')}`;
let sql: ReturnType<typeof postgres>, q: ChatPlanQueue, repo: ChatPlanRepository, recovery: ChatPlanRecoveryRepository, executor: ChatPlanExecutor, workers: ReturnType<typeof createChatPlanWorker>[] = [], connection: {
    host: string;
    port: number;
}, calls = 0;
const prefix = `chat-plan-test-${randomUUID()}`;
async function draft(capability = 'read_brand', parameters = {}) {
    const p = newPlan(conversation, parsePlanInput({ title: 'Plano sintético', goal: 'Verificar fila', tasks: [{ key: 'a', title: 'Consultar', capability, parameters, dependsOn: [] }] }));
    await repo.create(p);
    return repo.mutate(conversation, p.id, 1, p => changePlan(p, 'approve', 'human'));
}
const wake = (p: {
    id: string;
    version: number;
}) => ({ tenantId: tenant, userId: user, conversationId: conversation, planId: p.id, version: p.version });
suite('BullMQ e PostgreSQL reais descartáveis', () => {
    beforeAll(async () => {
        const dbUrl = new URL(url!), redisUrl = new URL(redis!);
        if (dbUrl.hostname !== '127.0.0.1' || !dbUrl.pathname.endsWith('_isolated') || redisUrl.hostname !== '127.0.0.1')
            throw Error('Somente serviços descartáveis explícitos');
        connection = { host: '127.0.0.1', port: Number(redisUrl.port) };
        sql = postgres(url!, { max: 8, onnotice: () => {
            }, connection: { search_path: schema } });
        await sql.unsafe(`CREATE SCHEMA ${schema}; CREATE TABLE tenants(id uuid PRIMARY KEY,deleted_at timestamptz); CREATE TABLE users(id uuid PRIMARY KEY,tenant_id uuid,email text,role text,deleted_at timestamptz);`);
        for (const file of ['0059_chat.sql', '0060_chat_approvals.sql', '0062_chat_approval_result.sql', '0063_chat_approval_display.sql', '0067_chat_approval_unknown.sql', '0071_chat_plans.sql'])
            await sql.unsafe(await readFile(new URL(`../../../../packages/db/migrations/${file}`, import.meta.url), 'utf8'));
        await sql `INSERT INTO tenants VALUES(${tenant},null)`;
        await sql `INSERT INTO users VALUES(${user},${tenant},'test@example.test','member',null)`;
        await sql `INSERT INTO chat_conversations(id,tenant_id,user_id,title) VALUES(${conversation},${tenant},${user},'test')`;
        const db = drizzle(sql) as never;
        repo = new ChatPlanRepository(tenant, user, db);
        recovery = new ChatPlanRecoveryRepository(db);
        q = new ChatPlanQueue(connection, { prefix });
        executor = new ChatPlanExecutor((t, u) => new ChatPlanRepository(t, u, db), { execute: async () => {
                calls++;
                await new Promise(r => setTimeout(r, 50));
                return { kind: 'completed', result: { summary: 'Resultado sintético verificável' } };
            }, reconcile: async () => ({ kind: 'waiting' }) }, { authorize: () => repo.currentIdentity() }, q);
        workers = [createChatPlanWorker(connection, executor, q, recovery, { prefix }), createChatPlanWorker(connection, executor, q, recovery, { prefix })];
        await Promise.all(workers.map(w => w.waitUntilReady()));
    }, 20000);
    afterAll(async () => {
        await Promise.all(workers.map(w => w.close()));
        if (q) {
            await q.queue.obliterate({ force: true });
            await q.close();
        }
        if (sql) {
            await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
            await sql.end();
        }
    }, 20000);
    it('duas réplicas, jobs duplicados, um efeito e evidência persistida', async () => {
        const before = calls, p = await draft();
        await Promise.all([
            q.enqueue(wake(p)), q.enqueue(wake(p)),
            q.queue.add('worker-chat-plan-execute-step', wake(p), { jobId: `duplicate-${p.id}` }),
        ]);
        await vi.waitFor(async () => expect((await repo.get(conversation, p.id)).status).toBe('completed'), { timeout: 10000 });
        await vi.waitFor(async () => expect(await q.queue.getJobs(['completed'])).toHaveLength(2), { timeout: 10000 });
        expect(calls - before).toBe(1);
        expect((await repo.get(conversation, p.id)).tasks[0].result).toEqual({ summary: 'Resultado sintético verificável' });
        const jobs = await q.queue.getJobs(['completed']);
        expect(jobs.some(j => j.name === 'worker-chat-plan-execute-step')).toBe(true);
        for (const job of jobs) {
            expect(Object.keys(job.data).sort()).toEqual(['conversationId', 'planId', 'tenantId', 'userId', 'version']);
            expect(JSON.stringify(job.data)).not.toContain('Bearer');
        }
        expect(q.queue.name).toBe(CHAT_PLAN_QUEUE_NAME);
    });
    it('recovery salva gap DB→Redis e scheduler é idempotente', async () => {
        const p = await draft();
        await q.scheduleRecovery();
        await q.scheduleRecovery();
        expect(await q.queue.getJobSchedulersCount()).toBe(1);
        await q.recover(recovery);
        await vi.waitFor(async () => expect((await repo.get(conversation, p.id)).status).toBe('completed'), { timeout: 10000 });
    });
    it('restart após chamada incerta não repete draft_text', async () => {
        const p = await draft('draft_text', { prompt: 'Texto sintético' });
        await repo.mutate(conversation, p.id, p.version, p => {
            Object.assign(p.tasks[0], { status: 'running', attempts: 1, fence: randomUUID(), leaseUntil: new Date(Date.now() - 1000).toISOString() });
        });
        const before = calls;
        await Promise.all(workers.map(w => w.close()));
        workers = [createChatPlanWorker(connection, executor, q, recovery, { prefix })];
        await workers[0].waitUntilReady();
        await q.recover(recovery);
        await vi.waitFor(async () => expect((await repo.get(conversation, p.id)).status).toBe('failed'), { timeout: 10000 });
        expect(calls).toBe(before);
        expect((await repo.get(conversation, p.id)).tasks[0].failure).toBe('unknown');
    });
});
