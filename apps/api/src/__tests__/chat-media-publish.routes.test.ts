import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const repo = vi.hoisted(() => ({findMedia:vi.fn(),claim:vi.fn(),result:vi.fn(),finish:vi.fn()}));
vi.mock('../repository/chat-media-publish.repository.js', () => ({ChatMediaPublishRepository:vi.fn(function () { return repo; })}));
import { PlannerController } from '../controllers/planner.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { errorHandler } from '../middleware/errorHandler.js';
const tenant = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const approval = '33333333-3333-4333-8333-333333333333';
const token = jwt.sign({userId:user,tenantId:tenant,email:'test@example.test',role:'admin'},process.env.JWT_SECRET!);
const publishNow = vi.fn();
function app() {
  const server = express(); server.use(express.json());
  const controller = new PlannerController({publishNow} as never);
  server.post('/planner/chat-media/:approvalId/publish',authMiddleware,tenantMiddleware,controller.handleChatMediaPublish);
  server.use(errorHandler); return server;
}
beforeEach(() => {
  vi.clearAllMocks();
  repo.findMedia.mockResolvedValue({kind:'image',url:'https://example.com/a.png'});
  repo.claim.mockResolvedValue(true);
  repo.finish.mockResolvedValue(undefined);
  publishNow.mockResolvedValue({status:'published'});
});
describe('rota de publicação de mídia', () => {
  it('requer usuário autenticado e valida os dados', async () => {
    const route = `/planner/chat-media/${approval}/publish`;
    expect((await request(app()).post(route).send({caption:'',instagramUserId:'ig'})).status).toBe(401);
    expect((await request(app()).post('/planner/chat-media/invalido/publish').set('Authorization',`Bearer ${token}`).send({caption:'',instagramUserId:'ig'})).status).toBe(400);
    expect((await request(app()).post(route).set('Authorization',`Bearer ${token}`).send({caption:'',instagramUserId:'ig',imageUrl:'https://attacker.test/a.png'})).status).toBe(400);
    expect(publishNow).not.toHaveBeenCalled();
  });
  it('consulta mídia com tenant e usuário autenticados e não aceita URL do cliente', async () => {
    const res = await request(app()).post(`/planner/chat-media/${approval}/publish`).set('Authorization',`Bearer ${token}`).send({caption:'oi',instagramUserId:'ig'});
    expect(res.status).toBe(200);
    expect(repo.findMedia).toHaveBeenCalledWith(tenant,user,approval);
    expect(publishNow).toHaveBeenCalledWith(tenant,expect.objectContaining({imageUrl:'https://example.com/a.png',expectedInstagramUserId:'ig'}));
  });
  it('retorna 404 sem publicar se mídia não pertence ao usuário', async () => {
    repo.findMedia.mockResolvedValue(null);
    const res = await request(app()).post(`/planner/chat-media/${approval}/publish`).set('Authorization',`Bearer ${token}`).send({caption:'',instagramUserId:'ig'});
    expect(res.status).toBe(404);
    expect(publishNow).not.toHaveBeenCalled();
  });
});
