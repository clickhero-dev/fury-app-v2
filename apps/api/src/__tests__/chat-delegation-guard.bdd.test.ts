/*
Funcionalidade: proteger as ações realizadas pelo chatbot
Cenário: uma ação aprovada é executada sob a identidade do usuário
Dado um token delegado e aprovação compatível
Quando o assistente chama uma ferramenta
Então a aprovação é consumida e a identidade fica disponível ao RBAC
Cenário: uma ação sem aprovação é bloqueada
Dado um token delegado sem aprovação compatível
Quando o assistente chama uma ferramenta
Então a API retorna 403
Cenário: rotas fora da lista são bloqueadas
Dado um token delegado válido
Quando ele tenta acessar outra rota
Então a API retorna 403
Cenário: banco indisponível bloqueia a execução
Dado falha no repositório de aprovações
Quando o assistente chama uma ferramenta
Então a API retorna 503
*/
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createChatDelegation } from '../lib/chat-delegation.js';
import { createDelegationGuard, getDelegatedUser } from '../middleware/chat-delegation.middleware.js';
import { authMiddleware, peekUsersFromRequest } from '../middleware/auth.middleware.js';
const secret = 'test-secret-with-sufficient-entropy-1234567890';
const user = { userId:'u1', tenantId:'t1', role:'admin', email:'a@example.com' };
const token = createChatDelegation(user, secret);
function app(consume: any) {
  const app = express(); app.use(express.json());
  app.use(createDelegationGuard({secret, repository: () => ({ consume })}));
  app.use((req,res) => res.json({ user: getDelegatedUser(req) }));
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || 500).json({ code: err.code }));
  return app;
}
describe('guard de delegação', () => {
  it('consome aprovação vinculada à requisição e expõe identidade', async () => {
    const consume = vi.fn().mockResolvedValue(true);
    const res = await request(app(consume)).post('/api/planner/posts').set('Authorization', `Bearer ${token}`).set('X-Chat-Approval-Id', '11111111-1111-4111-8111-111111111111').send({ text:'oi' });
    expect(res.status).toBe(200); expect(res.body.user).toMatchObject(user);
    expect(consume).toHaveBeenCalledWith(expect.objectContaining({ ...user, method:'POST', path:'/api/planner/posts', body:{ text:'oi' } }));
  });
  it('registra conclusão somente após resposta bem-sucedida', async () => {
    const complete = vi.fn().mockResolvedValue(undefined);
    const app = express(); app.use(express.json());
    app.use(createDelegationGuard({secret, repository: () => ({ consume: async () => true, complete })}));
    app.post('/api/planner/posts', (_req,res) => res.status(201).json({ok:true}));
    await request(app).post('/api/planner/posts').set('Authorization', `Bearer ${token}`).set('X-Chat-Approval-Id', '11111111-1111-4111-8111-111111111111').send({});
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(complete).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', user.userId);
  });
  it('registra falha de validação sem permitir repetição', async () => {
    const fail = vi.fn().mockResolvedValue(undefined);
    const server = express(); server.use(express.json());
    server.use(createDelegationGuard({secret, repository: () => ({ consume: async () => true, fail })}));
    server.post('/api/planner/posts', (_req,res) => res.status(400).json({error:'invalid'}));
    await request(server).post('/api/planner/posts').set('Authorization', `Bearer ${token}`).set('X-Chat-Approval-Id', '11111111-1111-4111-8111-111111111111').send({});
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(fail).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', user.userId);
  });
  it('marca resultado desconhecido de ação síncrona em erro 5xx', async () => {
    const unknown = vi.fn().mockResolvedValue(undefined);
    const server = express(); server.use(express.json());
    server.use(createDelegationGuard({secret,repository:()=>({consume:async()=>true,unknown})}));
    server.post('/api/planner/posts',(_req,res)=>res.status(503).json({error:'detalhe interno'}));
    await request(server).post('/api/planner/posts').set('Authorization',`Bearer ${token}`).set('X-Chat-Approval-Id','11111111-1111-4111-8111-111111111111').send({});
    await new Promise(resolve=>setTimeout(resolve,10));
    expect(unknown).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111',user.userId);
  });
  it('não marca resultado desconhecido para job de vídeo recuperável', async () => {
    const unknown = vi.fn().mockResolvedValue(undefined);
    const server=express();server.use(express.json());
    server.use(createDelegationGuard({secret,repository:()=>({consume:async()=>true,unknown})}));
    server.post('/api/studio/video/jobs',(_req,res)=>res.status(503).end());
    await request(server).post('/api/studio/video/jobs').set('Authorization',`Bearer ${token}`).set('X-Chat-Approval-Id','11111111-1111-4111-8111-111111111111').send({});
    await new Promise(resolve=>setTimeout(resolve,10));
    expect(unknown).not.toHaveBeenCalled();
  });
  it('marca resultado desconhecido quando conexão encerra antes da resposta', async () => {
    const unknown = vi.fn().mockResolvedValue(undefined);
    const server=express();server.use(express.json());
    server.use(createDelegationGuard({secret,repository:()=>({consume:async()=>true,unknown})}));
    server.post('/api/planner/posts',(_req,res)=>res.destroy());
    await request(server).post('/api/planner/posts').set('Authorization',`Bearer ${token}`).set('X-Chat-Approval-Id','11111111-1111-4111-8111-111111111111').send({}).catch(()=>undefined);
    await new Promise(resolve=>setTimeout(resolve,10));
    expect(unknown).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111',user.userId);
  });
  it('registra sucesso tardio mesmo após desconexão', async () => {
    const unknown = vi.fn().mockResolvedValue(undefined), complete = vi.fn().mockResolvedValue(undefined);
    const server=express();server.use(express.json());
    server.use(createDelegationGuard({secret,repository:()=>({consume:async()=>true,unknown,complete})}));
    server.post('/api/planner/posts',(_req,res)=>{res.destroy();setTimeout(()=>res.status(200).json({success:true}),5);});
    await request(server).post('/api/planner/posts').set('Authorization',`Bearer ${token}`).set('X-Chat-Approval-Id','11111111-1111-4111-8111-111111111111').send({}).catch(()=>undefined);
    await new Promise(resolve=>setTimeout(resolve,30));
    expect(unknown).toHaveBeenCalled();expect(complete).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111',user.userId);
  });
  it('nega ação sem aprovação correspondente', async () => {
    const res = await request(app(vi.fn().mockResolvedValue(false))).post('/api/planner/posts').set('Authorization', `Bearer ${token}`).set('X-Chat-Approval-Id', '11111111-1111-4111-8111-111111111111').send({});
    expect(res.status).toBe(403);
  });
  it('bloqueia outros caminhos', async () => {
    const res = await request(app(vi.fn())).get('/api/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
  it('permite apenas leitura de assets', async () => {
    const consume = vi.fn();
    const server = app(consume);
    expect((await request(server).get('/api/studio/assets').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await request(server).get('/api/studio/assets/11111111-1111-4111-8111-111111111111').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await request(server).delete('/api/studio/assets/11111111-1111-4111-8111-111111111111').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect(consume).not.toHaveBeenCalled();
  });
  it('bloqueia exclusão de campanha mesmo com aprovação', async () => {
    const consume = vi.fn().mockResolvedValue(true);
    const res = await request(app(consume)).delete('/api/campaigns/11111111-1111-4111-8111-111111111111').set('Authorization', `Bearer ${token}`).set('X-Chat-Approval-Id', '11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(403);
    expect(consume).not.toHaveBeenCalled();
  });
  it('preserva identidade delegada no RBAC e na autenticação da rota', async () => {
    const server = express(); server.use(express.json());
    server.use(createDelegationGuard({secret, repository: () => ({consume: async () => true})}));
    server.use((req, _res, next) => { expect(peekUsersFromRequest(req)).toMatchObject([user]); next(); });
    server.post('/api/planner/posts', authMiddleware, (req,res) => res.json(req.user));
    const res = await request(server).post('/api/planner/posts').set('Authorization', `Bearer ${token}`).set('X-Chat-Approval-Id', '11111111-1111-4111-8111-111111111111').send({});
    expect(res.status).toBe(200); expect(res.body).toMatchObject(user);
  });
  it('não permite ações quando o banco falha', async () => {
    const res = await request(app(vi.fn().mockRejectedValue(Error('db')))).post('/api/planner/posts').set('Authorization', `Bearer ${token}`).set('X-Chat-Approval-Id', '11111111-1111-4111-8111-111111111111').send({});
    expect(res.status).toBe(503);
  });
});
