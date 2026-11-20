import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatRequest } from './chat-request';
import { chatWebSocket } from './chat-websocket';

vi.mock('./chat-request', () => ({chatRequest: vi.fn(), ChatRequestError: class extends Error { constructor(public status: number, public approvalFailure: null, public code: string | null) { super('request'); } }}));
class Socket {
  static instances: Socket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: {data: string}) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: {code:number}) => void) | null = null;
  send = vi.fn(); close = vi.fn();
  constructor(public url: string) { Socket.instances.push(this); }
}
const payload = {path:'/conversations/conv/messages', body:{clientKey:'key', responseCapabilities:['multi_message_v1'], content:'Olá'}};
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); Socket.instances = []; });
async function connect() {
  vi.stubEnv('VITE_CHAT_WS_URL', 'wss://chat.example/ws');
  vi.stubGlobal('WebSocket', Socket);
  vi.mocked(chatRequest).mockResolvedValue(new Response(JSON.stringify({ticket:'secret'})));
  const pending = chatWebSocket(payload);
  await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
  const socket = Socket.instances[0]; socket.onopen?.();
  socket.onmessage?.({data:JSON.stringify({event:'ack',data:{}})});
  return {socket, response:await pending};
}
describe('chat websocket transport', () => {
  it('uses a ticket only in the first frame and forwards all events in order', async () => {
    const {socket,response} = await connect();
    expect(chatRequest).toHaveBeenCalledWith('/websocket-ticket', {method:'POST',body:'{}',signal:expect.any(AbortSignal)});
    expect(socket.url).toBe('wss://chat.example/ws');
    expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({ticket:'secret',...payload});
    const read = response.body!.getReader();
    socket.onmessage?.({data:JSON.stringify({event:'token',data:{content:'Oi'}})});
    socket.onmessage?.({data:JSON.stringify({event:'done',data:{message:{content:'Oi'}}})});
     socket.onmessage?.({data:JSON.stringify({event:'title',data:{title:'Novo'}})});
     socket.onmessage?.({data:JSON.stringify({event:'end',data:{}})});
    socket.onclose?.({code:1000});
    expect(new TextDecoder().decode((await read.read()).value)).toContain('event: token');
    expect(new TextDecoder().decode((await read.read()).value)).toContain('event: done');
    expect(new TextDecoder().decode((await read.read()).value)).toContain('event: title');
    expect((await read.read()).done).toBe(true);
  });
  it('waits for ack before accepting and maps rejection status and code', async () => {
    vi.stubEnv('VITE_CHAT_WS_URL', 'wss://chat.example/ws'); vi.stubGlobal('WebSocket', Socket);
    vi.mocked(chatRequest).mockResolvedValue(new Response('{"ticket":"secret"}'));
    const pending = chatWebSocket(payload); await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
    const socket = Socket.instances[0]; socket.onopen?.();
    let accepted = false; void pending.then(() => { accepted = true; }, () => {});
    await Promise.resolve(); expect(accepted).toBe(false);
    socket.onmessage?.({data:JSON.stringify({event:'error', data:{status:409,code:'retry_compacted'}})});
    await expect(pending).rejects.toMatchObject({status:409,code:'retry_compacted'});
  });
  it.each([{path:'/conversations/conv/retry?run_id=run-1',body:{clientKey:'retry',responseCapabilities:['multi_message_v1']}},{path:'/conversations/conv/clarifications/clar-1/answer',body:{clientKey:'choice',choiceIndex:1,responseCapabilities:['multi_message_v1']}}])('preserves the request path and body: $path', async (request) => {
    vi.stubEnv('VITE_CHAT_WS_URL', 'wss://chat.example/ws'); vi.stubGlobal('WebSocket', Socket);
    vi.mocked(chatRequest).mockResolvedValue(new Response('{"ticket":"secret"}'));
    const pending = chatWebSocket(request); await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
    const socket = Socket.instances[0]; socket.onopen?.();
    expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({ticket:'secret',...request});
    socket.onmessage?.({data:JSON.stringify({event:'ack',data:{}})}); await pending;
    expect(socket.send).toHaveBeenCalledTimes(1);
  });
  it('rejects if disconnected before ack', async () => {
    vi.stubEnv('VITE_CHAT_WS_URL', 'wss://chat.example/ws'); vi.stubGlobal('WebSocket', Socket);
    vi.mocked(chatRequest).mockResolvedValue(new Response('{"ticket":"secret"}'));
    const pending = chatWebSocket(payload); await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
    Socket.instances[0].onopen?.(); Socket.instances[0].onclose?.({code:1006});
    await expect(pending).rejects.toThrow();
  });
  it.each([false, true])('times out before ack (open=%s), closes and never sends again', async (open) => {
    vi.stubEnv('VITE_CHAT_WS_URL', 'wss://chat.example/ws'); vi.stubGlobal('WebSocket', Socket);
    vi.mocked(chatRequest).mockResolvedValue({json: async () => ({ticket:'secret'})} as Response);
    vi.useFakeTimers();
    const pending = chatWebSocket(payload); await vi.advanceTimersByTimeAsync(0);
    const socket = Socket.instances[0]; if (open) socket.onopen?.();
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(16000);
    expect(socket.close).toHaveBeenCalled();
    await rejected; socket.onopen?.();
    expect(socket.send).toHaveBeenCalledTimes(open ? 1 : 0);
  }, 20000);
  it('clears the handshake deadline after ack without interrupting a long response', async () => {
    vi.stubEnv('VITE_CHAT_WS_URL', 'wss://chat.example/ws'); vi.stubGlobal('WebSocket', Socket);
    vi.mocked(chatRequest).mockResolvedValue({json: async () => ({ticket:'secret'})} as Response);
    vi.useFakeTimers(); const pending = chatWebSocket(payload);
    await vi.advanceTimersByTimeAsync(0);
    const socket = Socket.instances[0]; socket.onopen?.(); socket.onmessage?.({data:JSON.stringify({event:'ack',data:{}})});
    const response = await pending; await vi.advanceTimersByTimeAsync(16000);
    expect(socket.close).not.toHaveBeenCalled();
    socket.onmessage?.({data:JSON.stringify({event:'done',data:{}})}); socket.onmessage?.({data:JSON.stringify({event:'end',data:{}})});
    const reader = response.body!.getReader(); expect((await reader.read()).done).toBe(false); expect((await reader.read()).done).toBe(true);
  });
  it('aborts a stalled ticket and never opens a socket, even if request ignores abort', async () => {
    vi.stubEnv('VITE_CHAT_WS_URL', 'wss://chat.example/ws'); vi.stubGlobal('WebSocket', Socket); vi.useFakeTimers();
    vi.mocked(chatRequest).mockReturnValue(new Promise(() => {}));
    const pending = chatWebSocket(payload); const rejected = expect(pending).rejects.toThrow();
    const signal = vi.mocked(chatRequest).mock.calls[0][1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(15000); await rejected;
    expect(signal?.aborted).toBe(true); expect(Socket.instances).toHaveLength(0);
  });
  it('times out a stalled ticket body and ignores a late result', async () => {
    vi.stubEnv('VITE_CHAT_WS_URL', 'wss://chat.example/ws'); vi.stubGlobal('WebSocket', Socket); vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    vi.mocked(chatRequest).mockResolvedValue({json: () => new Promise(resolve => { finish = resolve; })} as Response);
    const pending = chatWebSocket(payload); const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(15000); await rejected;
    finish({ticket:'late'}); await vi.advanceTimersByTimeAsync(0); expect(Socket.instances).toHaveLength(0);
  });
  it('times out a silent socket after ack, without replay', async () => {
    vi.stubEnv('VITE_CHAT_WS_URL', 'wss://chat.example/ws'); vi.stubGlobal('WebSocket', Socket); vi.useFakeTimers();
    vi.mocked(chatRequest).mockResolvedValue({json: async () => ({ticket:'secret'})} as Response);
    const pending = chatWebSocket(payload); await vi.advanceTimersByTimeAsync(0);
    const socket = Socket.instances[0]; socket.onopen?.(); socket.onmessage?.({data:JSON.stringify({event:'ack',data:{}})});
    const reader = (await pending).body!.getReader(); const rejected = expect(reader.read()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(45000); await rejected;
    expect(socket.close).toHaveBeenCalledTimes(1); expect(socket.send).toHaveBeenCalledTimes(1); expect(Socket.instances).toHaveLength(1);
  });
  it('heartbeats and regular frames refresh the inactivity deadline and end clears it', async () => {
    vi.stubEnv('VITE_CHAT_WS_URL', 'wss://chat.example/ws'); vi.stubGlobal('WebSocket', Socket); vi.useFakeTimers();
    vi.mocked(chatRequest).mockResolvedValue({json: async () => ({ticket:'secret'})} as Response);
    const pending = chatWebSocket(payload); await vi.advanceTimersByTimeAsync(0);
    const socket = Socket.instances[0]; socket.onopen?.(); socket.onmessage?.({data:JSON.stringify({event:'ack',data:{}})});
    const response = await pending; await vi.advanceTimersByTimeAsync(30000);
    socket.onmessage?.({data:JSON.stringify({event:'heartbeat',data:{}})}); await vi.advanceTimersByTimeAsync(30000);
    socket.onmessage?.({data:JSON.stringify({event:'token',data:{content:'Hi'}})}); await vi.advanceTimersByTimeAsync(30000);
    expect(socket.close).not.toHaveBeenCalled();
    socket.onmessage?.({data:JSON.stringify({event:'done',data:{}})}); socket.onmessage?.({data:JSON.stringify({event:'end',data:{}})});
    await vi.advanceTimersByTimeAsync(60000); expect(socket.close).toHaveBeenCalledTimes(1);
    const reader = response.body!.getReader(); expect((await reader.read()).done).toBe(false); expect((await reader.read()).done).toBe(false); expect((await reader.read()).done).toBe(true);
  });
  it('rejects invalid configuration and tickets without connecting', async () => {
    vi.stubGlobal('WebSocket', Socket); vi.stubEnv('VITE_CHAT_WS_URL', '/ws');
    await expect(chatWebSocket(payload)).rejects.toThrow();
    vi.stubEnv('VITE_CHAT_WS_URL', 'wss://chat.example/ws');
    vi.mocked(chatRequest).mockResolvedValue(new Response('{}'));
    await expect(chatWebSocket(payload)).rejects.toThrow();
    expect(Socket.instances).toHaveLength(0);
  });
  it.each(['ws://chat.example/ws','wss://user:pass@chat.example/ws','wss://chat.example/ws?token=secret','wss://chat.example/ws#secret','https://chat.example/ws'])('rejects insecure or secret-bearing URLs: %s', async (url) => {
    vi.stubGlobal('WebSocket', Socket); vi.stubEnv('VITE_CHAT_WS_URL', url);
    await expect(chatWebSocket(payload)).rejects.toThrow();
    expect(chatRequest).not.toHaveBeenCalled();
  });
  it('fails the stream on disconnect or malformed frames, without reconnecting', async () => {
    const {socket,response} = await connect();
    const read = response.body!.getReader(); socket.onclose?.({code:1000});
    await expect(read.read()).rejects.toThrow();
    expect(Socket.instances).toHaveLength(1);
  });
  it('treats abnormal closure after done as uncertain', async () => {
    const {socket,response} = await connect(); const read = response.body!.getReader();
    socket.onmessage?.({data:JSON.stringify({event:'done',data:{}})});
    await read.read(); socket.onclose?.({code:1006});
    await expect(read.read()).rejects.toThrow();
  });
  it('treats a normal close without end as interrupted even after done', async () => {
    const {socket,response} = await connect(); const read = response.body!.getReader();
    socket.onmessage?.({data:JSON.stringify({event:'done',data:{}})});
    await read.read(); socket.onclose?.({code:1000});
    await expect(read.read()).rejects.toThrow();
  });
  it('forwards terminal errors and ends without marking the connection interrupted', async () => {
    const {socket,response} = await connect(); const read = response.body!.getReader();
    socket.onmessage?.({data:JSON.stringify({event:'error',data:{message:'Falha'}})});
    socket.onmessage?.({data:JSON.stringify({event:'end',data:{}})});
    socket.onclose?.({code:1000});
    expect(new TextDecoder().decode((await read.read()).value)).toContain('event: error');
    expect((await read.read()).done).toBe(true);
  });
  it('fails malformed frames and ignores heartbeats', async () => {
    const {socket,response} = await connect(); const read = response.body!.getReader();
    socket.onmessage?.({data:JSON.stringify({event:'heartbeat',data:{}})});
    socket.onmessage?.({data:'not json'});
    await expect(read.read()).rejects.toThrow();
  });
});
