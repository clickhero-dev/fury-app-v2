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
        for (const file of ['0059_chat.sql', '0060_chat_approvals.sql', '0062_chat_approval_result.sql', '0063_chat_approval_display.sql', '0067_chat_approval_unknown.sql', '0071_chat_plans.sql'])
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
    it('não revela nem altera dados de outro owner', async () => {
        const p = await repo.create(draft());
        expect((await repo.list(conversation))[0].id).toBe(p.id);
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
