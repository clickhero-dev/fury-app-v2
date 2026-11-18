import { describe, expect, it, vi } from 'vitest';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { ChatPlanCapabilities } from '../services/chat/chat-plan-capabilities.js';
import { newPlan, parsePlanInput } from '../services/chat/chat-plan.domain.js';
import { planMemoryFixture } from './chat-plan.fixtures.js';

describe('contexto de plano é envelope JSON limitado e explícito', () => {
    it('omite resultado inteiro muito grande, preserva outputs no banco e informa chaves omitidas', async () => {
        const f = planMemoryFixture();
        const p = newPlan(f.conversationId, parsePlanInput({ title: 'Plano', goal: 'Rascunho', tasks: [
            { key: 'large', title: 'Grande', capability: 'draft_text', parameters: { prompt: 'ideia' }, dependsOn: [] },
            { key: 'small', title: 'Pequeno', capability: 'draft_text', parameters: { prompt: 'ideia' }, dependsOn: [] },
            { key: 'draft', title: 'Rascunho', capability: 'draft_text', parameters: { prompt: 'legenda' }, dependsOn: ['large', 'small'] },
        ] }));
        Object.assign(p.tasks[0], { status: 'completed', result: { text: '😀'.repeat(12000) } });
        Object.assign(p.tasks[1], { status: 'completed', result: { text: 'Ideia completa' } });
        p.tasks[2].attempts = 2;
        const before = JSON.stringify(p);
        const text = vi.fn(async () => 'Legenda real');
        const adapter = new ChatPlanCapabilities({ get: vi.fn(), resources: vi.fn(), videoOptions: vi.fn(), text });
        await adapter.execute(f.scope, p, p.tasks[2], await f.factory(f.tenantId, f.userId).currentIdentity());
        const context = (text.mock.calls[0] as unknown as [string, string, string, number])[2];
        expect(Buffer.byteLength(context)).toBeLessThanOrEqual(16000);
        expect(JSON.parse(context)).toEqual({ previousResults: [{ key: 'small', title: 'Pequeno', result: { text: 'Ideia completa' } }], omittedTaskKeys: ['large'], truncated: true });
        expect((text.mock.calls[0] as unknown as [string, string, string, number])[3]).toBe(2);
        expect(JSON.stringify(p)).toBe(before);
    });
    it('envelope vazio continua JSON válido', async () => {
        const f = planMemoryFixture(), p = newPlan(f.conversationId, parsePlanInput({ title: 'Plano', goal: 'Rascunho', tasks: [{ key: 'draft', title: 'Rascunho', capability: 'draft_text', parameters: { prompt: 'ideia' }, dependsOn: [] }] }));
        const text = vi.fn(async () => 'Texto real');
        await new ChatPlanCapabilities({ get: vi.fn(), resources: vi.fn(), videoOptions: vi.fn(), text }).execute(f.scope, p, p.tasks[0], await f.factory(f.tenantId, f.userId).currentIdentity());
        expect(JSON.parse((text.mock.calls[0] as unknown as [string, string, string])[2])).toEqual({ previousResults: [], omittedTaskKeys: [], truncated: false });
    });
});
