import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
vi.mock('../lib/ai-key-context.js', () => ({
    resolveAiKey: vi.fn(async () => ({ key: 'test-key', scope: 'ady' })),
    runWithTenant: (_tenant: string, fn: () => unknown) => fn(),
}));
import { ChatPlanTextAdapter } from '../services/chat/chat-plan-text.js';
import { ChatPlanCapabilities } from '../services/chat/chat-plan-capabilities.js';
import { ChatPlanExecutor } from '../services/chat/chat-plan-executor.js';
import { changePlan, newPlan, parsePlanInput } from '../services/chat/chat-plan.domain.js';
import { openrouterService } from '../services/llms/openrouter.service.js';
import { planMemoryFixture } from './chat-plan.fixtures.js';

const backup = 'vendor/backup';
const env = { CHAT_FALLBACK_MODELS: `vendor/not-approved,${backup},vendor/last`, CHAT_FALLBACK_CAPABILITIES: JSON.stringify({
    [backup]: { supported_parameters: ['temperature', 'max_tokens'] },
    'vendor/last': { supported_parameters: ['temperature', 'max_tokens'] },
}) };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
const response = (status = 200) => new Response(status === 200 ? JSON.stringify({ choices: [{ message: { content: 'Texto real' } }] }) : 'private-provider-diagnostics', { status });

describe('texto de plano com orçamento persistido, sem retries internos', () => {
    it('HTTP503 real é transient; executor só envia principal e fallback em duas tentativas persistidas', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const fetcher = vi.fn(async () => response(503)); vi.stubGlobal('fetch', fetcher);
        const adapter = new ChatPlanTextAdapter({ chat: openrouterService.chat, env });
        const f = planMemoryFixture(), repo = f.factory(f.tenantId, f.userId);
        const p = newPlan(f.conversationId, parsePlanInput({ title: 'Texto', goal: 'Rascunho', tasks: [{ key: 'text', title: 'Texto', capability: 'draft_text', parameters: { prompt: 'Escreva uma ideia' }, dependsOn: [] }] }));
        changePlan(p, 'approve', 'human'); await repo.create(p);
        const wake = { ...f.scope, planId: p.id, version: p.version };
        let now = Date.now();
        const capabilities = new ChatPlanCapabilities({ get: vi.fn(), resources: vi.fn(), videoOptions: vi.fn(), text: (...args) => adapter.generate(...args) });
        const executor = new ChatPlanExecutor(f.factory, capabilities, { authorize: () => repo.currentIdentity() }, { enqueue: vi.fn() }, () => now);
        await executor.run(wake);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect((await repo.get(f.conversationId, p.id)).tasks[0]).toMatchObject({ status: 'pending', attempts: 1 });
        await executor.run(wake);
        expect(fetcher).toHaveBeenCalledTimes(1); // backoff persisted
        now += 2100;
        await executor.run(wake);
        await executor.run(wake);
        expect(fetcher).toHaveBeenCalledTimes(2);
        const payloads = fetcher.mock.calls.map(call => JSON.parse((call as unknown as [string, RequestInit])[1].body as string));
        expect(payloads.map(p => p.model)).toEqual(['deepseek/deepseek-chat', backup]);
        expect({ ...payloads[1], model: payloads[0].model }).toEqual(payloads[0]);
        expect((await repo.get(f.conversationId, p.id)).tasks[0]).toMatchObject({ status: 'failed', failure: 'permanent', attempts: 2 });
        expect(JSON.stringify(await repo.get(f.conversationId, p.id))).not.toContain('private-provider');
    });
    it.each([408, 429, 500, 503, 599])('HTTP%s transitório é classificado sem expor diagnóstico', async status => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const fetcher = vi.fn(async () => response(status)); vi.stubGlobal('fetch', fetcher);
        const adapter = new ChatPlanTextAdapter({ chat: openrouterService.chat, env });
        await expect(adapter.generate('tenant', 'Pedido', 'Contexto', 1)).rejects.toMatchObject({ reason: 'transient' });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it.each([400, 401, 402, 403, 404, 422])('HTTP%s não é retryable e mantém contrato público OpenRouter', async status => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const fetcher = vi.fn(async () => response(status)); vi.stubGlobal('fetch', fetcher);
        await expect(openrouterService.chat([])).rejects.toMatchObject({ statusCode: 502, code: 'OPENROUTER_CHAT_ERROR', providerStatus: status, message: 'Falha ao gerar o texto. Tente novamente.' });
        const adapter = new ChatPlanTextAdapter({ chat: openrouterService.chat, env });
        await expect(adapter.generate('tenant', 'Pedido', 'Contexto')).rejects.toMatchObject({ reason: 'invalid' });
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('falha de rede é retryable, erro desconhecido ou de orçamento não', async () => {
        const fetcher = vi.fn(async () => { throw new TypeError('private-network-details'); }); vi.stubGlobal('fetch', fetcher);
        await expect(new ChatPlanTextAdapter({ chat: openrouterService.chat, env }).generate('t', 'P', '{}')).rejects.toMatchObject({ reason: 'transient' });
        const chat = vi.fn(async () => { throw new Error('budget-private'); });
        await expect(new ChatPlanTextAdapter({ chat, env }).generate('t', 'P', '{}')).rejects.toMatchObject({ reason: 'invalid' });
    });
    it('timeout durante consumo do corpo é transient', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new DOMException('private', 'AbortError'); } })));
        await expect(new ChatPlanTextAdapter({ chat: openrouterService.chat, env }).generate('t', 'P', '{}')).rejects.toMatchObject({ reason: 'transient' });
    });
    it.each([
        {},
        { CHAT_FALLBACK_MODELS: backup },
        { CHAT_FALLBACK_MODELS: backup, CHAT_FALLBACK_CAPABILITIES: JSON.stringify({ [backup]: { supported_parameters: ['temperature'] } }) },
        { ...env, CHAT_FALLBACK_CAPABILITIES: '{malformed' },
        { ...env, CHAT_FALLBACK_MODELS: 'https://evil.test' },
    ])('sem fallback homologado, segunda tentativa repete principal sem alterar payload (%j)', async config => {
        const chat = vi.fn(async () => 'ok'), adapter = new ChatPlanTextAdapter({ chat, env: config });
        await adapter.generate('t', 'Pedido original', '{"context":"inteiro"}', 1);
        await adapter.generate('t', 'Pedido original', '{"context":"inteiro"}', 2);
        expect(chat).toHaveBeenCalledTimes(2);
        expect(chat.mock.calls[1]).toEqual(chat.mock.calls[0]);
    });
    it('aceita configuração JSON e preserva parâmetros/contexto no fallback', async () => {
        const chat = vi.fn(async () => 'ok');
        const adapter = new ChatPlanTextAdapter({ chat, env: { ...env, CHAT_FALLBACK_MODELS: JSON.stringify([backup]) } });
        await adapter.generate('t', 'Não cortar', '{"dados":"não remover"}', 2);
        expect(chat).toHaveBeenCalledTimes(1);
        expect(chat.mock.calls[0]).toMatchObject([
            [{ role: 'system' }, { role: 'user', content: expect.stringContaining('{"dados":"não remover"}') }],
            { model: backup, temperature: 0.5, max_tokens: 2000, timeoutMs: 60000 },
        ]);
    });
    it.each([0, 3, 1.5, NaN])('não chama provider com tentativa inválida %s', async attempt => {
        const chat = vi.fn(), adapter = new ChatPlanTextAdapter({ chat, env });
        await expect(adapter.generate('t', 'P', '{}', attempt)).rejects.toMatchObject({ reason: 'invalid' });
        expect(chat).not.toHaveBeenCalled();
    });
    it.each([1, 2])('guard conservativo UTF8 de contexto bloqueia antes da tentativa %s, sem cortar conteúdo', async attempt => {
        const chat = vi.fn(), adapter = new ChatPlanTextAdapter({ chat, env });
        await expect(adapter.generate('t', 'P', '😀'.repeat(12000), attempt)).rejects.toMatchObject({ reason: 'invalid' });
        expect(chat).not.toHaveBeenCalled();
    });
});
