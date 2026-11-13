/*
Funcionalidade: acesso ao serviço de chat autenticado
Cenário: encaminhar requisição com identidade delegada
Dado um usuário autenticado
Quando ele solicita suas conversas
Então o serviço recebe identidade delegada sem o token original
Cenário: rejeitar acesso sem usuário
Dado uma requisição sem identidade autenticada
Quando ela solicita conversas
Então o acesso é negado
Cenário: falha no serviço
Dado que o serviço está indisponível
Quando o usuário solicita conversas
Então recebe erro seguro
Cenário: tentar novamente uma resposta interrompida
Dado um usuário autenticado e uma conversa
Quando ele solicita novamente a resposta por POST
Então o proxy encaminha o pedido com identidade delegada
*/
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createChatProxy } from '../routes/chat.routes.js';

const user = { userId: 'u1', tenantId: 't1', email: 'a@example.com', role: 'admin' };
const secret = 'test-secret-with-sufficient-entropy-1234567890';
function app(fetcher: typeof fetch, logged = true) {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { if (logged) req.user = user; next(); });
  app.use('/chat', createChatProxy({ baseUrl: 'http://chat:8000', secret, fetcher }));
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || 500).json({ code: err.code }));
  return app;
}
describe('proxy do chat', () => {
  it('encaminha identidade sem token original', async () => {
    const fetcher = vi.fn(async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const res = await request(app(fetcher)).get('/chat/conversations').set('Authorization', 'Bearer original');
    expect(res.status).toBe(200);
    const args = vi.mocked(fetcher).mock.calls[0];
    expect(args[0]).toBe('http://chat:8000/conversations');
    expect((args[1]?.headers as Record<string, string>).authorization).not.toContain('original');
    expect((args[1]?.headers as Record<string, string>).authorization).toMatch(/^Bearer /);
  });
  it('rejeita usuário ausente', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    expect((await request(app(fetcher, false)).get('/chat/conversations')).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('retorna erro seguro quando o serviço falha', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('secret internal url')) as unknown as typeof fetch;
    const res = await request(app(fetcher)).get('/chat/conversations');
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('secret internal');
  });
  it('transmite eventos SSE sem buffering de proxy', async () => {
    const fetcher = vi.fn(async () => new Response('data: {"text":"olá"}\n\n', { headers: { 'content-type': 'text/event-stream' } })) as unknown as typeof fetch;
    const res = await request(app(fetcher)).get('/chat/conversations/123/messages');
    expect(res.status).toBe(200);
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.text).toContain('olá');
  });
  it('bloqueia caminhos internos não autorizados', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    expect((await request(app(fetcher)).get('/chat/admin')).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserva o run_id exato na tentativa de resposta direcionada', async () => {
    const fetcher = vi.fn(async () => new Response('data: {"text":"ok"}\n\n', { headers: { 'content-type': 'text/event-stream' } })) as unknown as typeof fetch;
    const res = await request(app(fetcher))
      .post('/chat/conversations/123/retry?run_id=run-123%2Ftarget%2B1')
      .send({});

    expect(res.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetcher).mock.calls[0][0]).toBe('http://chat:8000/conversations/123/retry?run_id=run-123%2Ftarget%2B1');
    expect(vi.mocked(fetcher).mock.calls[0][1]?.method).toBe('POST');
  });
  it('encaminha tentativa de resposta somente por POST', async () => {
    const fetcher = vi.fn(async () => new Response('data: {"text":"ok"}\n\n', {headers:{'content-type':'text/event-stream'}})) as unknown as typeof fetch;
    const server=app(fetcher);
    const res=await request(server).post('/chat/conversations/123/retry').send({});
    expect(res.status).toBe(200);
    expect(vi.mocked(fetcher).mock.calls[0][0]).toBe('http://chat:8000/conversations/123/retry');
    expect(vi.mocked(fetcher).mock.calls[0][1]?.method).toBe('POST');
    expect((await request(server).get('/chat/conversations/123/retry')).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
