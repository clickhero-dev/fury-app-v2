/*
Funcionalidade: cancelar agendamento com versão aprovada
Cenário: cancelar a versão apresentada
Dado um post agendado e sua versão
Quando o cancelamento é solicitado
Então o serviço recebe a versão e cancela o agendamento
Cenário: rejeitar versão obsoleta
Dado um post alterado após a proposta
Quando a versão anterior é informada
Então a API retorna conflito
Cenário: rejeitar dados inválidos
Dado uma versão ausente
Quando o cancelamento é solicitado
Então a API retorna erro de validação
*/
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PlannerController } from '../controllers/planner.controller.js';
const post = '11111111-1111-4111-8111-111111111111';
function app(cancel: any) {
  const controller = new PlannerController({cancelChatPost: cancel} as any);
  const server = express(); server.use(express.json());
  server.use((req,_res,next) => { req.tenant = {tenantId:'tenant'}; next(); });
  server.patch('/posts/:postId/chat-cancel',controller.handleChatCancel);
  server.use((err: any,_req: any,res: any,_next: any) => res.status(err.statusCode || (err.name === 'ZodError' ? 400 : 500)).json({code:err.code}));
  return server;
}
describe('cancelamento com versão', () => {
 it('cancela a versão aprovada', async () => {
   const cancel = vi.fn().mockResolvedValue({id:post});
   const response = await request(app(cancel)).patch(`/posts/${post}/chat-cancel`).send({version:'123'});
   expect(response.status).toBe(200); expect(cancel).toHaveBeenCalledWith('tenant',post,'123');
 });
 it('retorna conflito para versão alterada', async () => {
   const cancel = vi.fn().mockRejectedValue(Object.assign(new Error('conflict'),{statusCode:409}));
   expect((await request(app(cancel)).patch(`/posts/${post}/chat-cancel`).send({version:'123'})).status).toBe(409);
 });
 it('rejeita versão ausente', async () => {
   const cancel = vi.fn(); expect((await request(app(cancel)).patch(`/posts/${post}/chat-cancel`).send({})).status).toBe(400); expect(cancel).not.toHaveBeenCalled();
 });
});
