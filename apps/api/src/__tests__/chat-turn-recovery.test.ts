import { describe, it, expect, vi } from 'vitest';
import { ChatTurnRecoveryRuntime } from '../services/chat/chat-turn-recovery-runtime.js';

const item = { tenantId:'00000000-0000-4000-8000-000000000001', userId:'00000000-0000-4000-8000-000000000002',
  conversationId:'00000000-0000-4000-8000-000000000003', runId:'00000000-0000-4000-8000-000000000004',
  userMessageId:'00000000-0000-4000-8000-000000000005' };

describe('durable turn recovery', () => {
  it('reconciles DB every tick, reauthorizes, creates ephemeral delegation and drains SSE', async () => {
    const store = { list:vi.fn().mockResolvedValue([item]), stop:vi.fn() };
    const authorize = vi.fn().mockResolvedValue({...item,email:'test@example.invalid',role:'member'});
    const fetcher = vi.fn().mockResolvedValue(new Response('event: done\ndata: {}\n\n', {headers:{'content-type':'text/event-stream'}}));
    const runtime = new ChatTurnRecoveryRuntime(store,{authorize},{baseUrl:'http://chat:8000',secret:'x'.repeat(48),fetcher});
    await runtime.tick();
    expect(authorize).toHaveBeenCalledWith(item);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toContain(`/conversations/${item.conversationId}/retry?run_id=${item.runId}`);
    expect(JSON.parse(options.body)).toEqual({automatic:true,responseCapabilities:['multi_message_v1']});
    expect(options.headers.authorization).toMatch(/^Bearer /);
    expect(store.stop).not.toHaveBeenCalled();
    await runtime.tick();
    expect(store.list).toHaveBeenCalledTimes(2);
    expect(authorize).toHaveBeenCalledTimes(2);
  });
  it('revoked authorization stops only persisted candidate, never calls Python', async () => {
    const store = {list:vi.fn().mockResolvedValue([item]),stop:vi.fn()};
    const fetcher = vi.fn();
    const runtime = new ChatTurnRecoveryRuntime(store,{authorize:vi.fn().mockRejectedValue({statusCode:403})},{baseUrl:'http://chat',secret:'x'.repeat(48),fetcher});
    await runtime.tick();
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.stop).toHaveBeenCalledWith(item);
  });
  it('transient identity/HTTP errors leave durable work for a later scan and concurrent ticks do not duplicate work', async () => {
    const store = {list:vi.fn().mockResolvedValue([item]),stop:vi.fn()};
    const access = {authorize:vi.fn().mockRejectedValue(new Error('DB offline'))};
    const runtime = new ChatTurnRecoveryRuntime(store,access,{baseUrl:'http://chat',secret:'x'.repeat(48)});
    await Promise.all([runtime.tick(),runtime.tick()]);
    expect(store.list).toHaveBeenCalledTimes(1);
    expect(store.stop).not.toHaveBeenCalled();
  });
  it('401/403 retry responses stop recovery; 409 races and timeout remain reconcilable', async () => {
    for (const status of [401,403,409,503]) {
      const store = {list:vi.fn().mockResolvedValue([item]),stop:vi.fn()};
      const runtime = new ChatTurnRecoveryRuntime(store,{authorize:vi.fn().mockResolvedValue({...item,email:'a@b.test',role:'member'})},
        {baseUrl:'http://chat',secret:'x'.repeat(48),fetcher:vi.fn().mockResolvedValue(new Response('',{status}))});
      await runtime.tick();
      expect(store.stop).toHaveBeenCalledTimes([401,403].includes(status) ? 1 : 0);
    }
  });
});
