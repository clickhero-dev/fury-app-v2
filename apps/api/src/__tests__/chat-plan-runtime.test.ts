/* Funcionalidade: integrações de produção, sem JWT persistido nem chamada arbitrária.
 * Cenário: Dado endpoint permitido, quando consultar, então gera delegação nova e timeout.
 * Cenário: Dado URL/método fora de escopo, quando solicitar, então bloqueia antes do fetch.
 * Cenário: Dado permissão revogada, quando executar, então nega pelo estado atual.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { ChatPlanApiReader, ChatPlanAccess } from '../services/chat/chat-plan-runtime.js';
import { verifyChatDelegation } from '../lib/chat-delegation.js';
import { planMemoryFixture } from './chat-plan.fixtures.js';
const secret = 'isolated-ephemeral-delegation-secret-test';
let f: ReturnType<typeof planMemoryFixture>;
beforeEach(() => {
    f = planMemoryFixture();
});
describe('runtime fechado', () => {
    it('GET fixo com token novo e timeout; nunca credentials persistidos', async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [] })));
        const http = new ChatPlanApiReader({ baseUrl: 'http://api:3000', secret, fetcher });
        const user = await f.factory(f.tenantId, f.userId).currentIdentity();
        await http.get(user, '/api/campaigns?limit=20&offset=0');
        const [url, options] = fetcher.mock.calls[0] as unknown as [
            string,
            RequestInit
        ];
        expect(url).toBe('http://api:3000/api/campaigns?limit=20&offset=0');
        expect(options.method).toBe('GET');
        expect(options.signal).toBeDefined();
        expect(options.redirect).toBe('error');
        expect(verifyChatDelegation((options.headers as any).authorization.slice(7), secret)).toMatchObject({ userId: f.userId, actor: 'chatbot' });
    });
    it.each(['https://evil.test', '/api/campaigns/../auth/me', '/api/auth/me', '/api/campaigns?url=https://evil.test', '/api/studio/video/jobs/not-a-uuid'])('bloqueia %s', async (path) => {
        const fetcher = vi.fn();
        const http = new ChatPlanApiReader({ baseUrl: 'http://api:3000', secret, fetcher });
        await expect(http.get(await f.factory(f.tenantId, f.userId).currentIdentity(), path)).rejects.toThrow();
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('403 não é transient; 503 e timeout são leituras retryable sem vazar body', async () => {
        const fetcher = vi.fn(async () => new Response('provider secret', { status: 403 }));
        const http = new ChatPlanApiReader({ baseUrl: 'http://api:3000', secret, fetcher });
        const user = await f.factory(f.tenantId, f.userId).currentIdentity();
        await expect(http.get(user, '/api/brand-kit')).rejects.toMatchObject({ reason: 'revoked' });
        fetcher.mockResolvedValue(new Response('private', { status: 503 }));
        await expect(http.get(user, '/api/brand-kit')).rejects.toMatchObject({ reason: 'transient' });
    });
    it('acesso consulta owner e RBAC atuais, inclusive draft_text', async () => {
        const check = vi.fn(async () => 'allowed' as const);
        const rbac = { checkServices: check, getPlatformRole: vi.fn(async () => 'user') };
        const sub = vi.fn(async () => ({ status: 'active', currentPeriodEnd: new Date('2099-01-01') }));
        const access = new ChatPlanAccess(f.factory, rbac, () => ({ findSubscription: sub }));
        expect(await access.authorize(f.scope, 'draft_text')).toMatchObject({ userId: f.userId });
        expect(check).toHaveBeenCalledWith(f.userId, ['studio', 'studio.ai']);
        check.mockResolvedValue('blocked' as never);
        await expect(access.authorize(f.scope, 'read_brand')).rejects.toMatchObject({ statusCode: 403 });
        f.revoke();
        await expect(access.authorize(f.scope)).rejects.toMatchObject({ statusCode: 403 });
    });
});
