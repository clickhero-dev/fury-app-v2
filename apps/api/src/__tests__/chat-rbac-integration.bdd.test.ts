/*
Funcionalidade: permissões de ferramentas delegadas
Cenário: módulo bloqueado
Dado um usuário sem permissão de Estúdio
Quando o chatbot executa uma ação aprovada de imagem
Então o RBAC bloqueia a chamada antes do controlador
Cenário: módulo permitido
Dado um usuário com permissão de Estúdio
Quando o chatbot executa uma ação aprovada
Então o controlador recebe a identidade original
Cenário: usuário excluído
Dado um usuário excluído
Quando o chatbot executa uma ação
Então o RBAC recusa o acesso
*/
import {describe,it,expect,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import {createDelegationGuard} from '../middleware/chat-delegation.middleware.js';
import {createRbacMiddleware} from '../middleware/rbac.middleware.js';
import {authMiddleware} from '../middleware/auth.middleware.js';
import {createChatDelegation} from '../lib/chat-delegation.js';
const secret='test-secret-with-sufficient-entropy-1234567890',approval='11111111-1111-4111-8111-111111111111';
const user={userId:'user',tenantId:'tenant',email:'a@example.com',role:'member'};
const token=createChatDelegation(user,secret);
function server(result:'allowed'|'blocked'|'unknown_user'){
 const handler=vi.fn((req,res)=>res.json(req.user));const checkServices=vi.fn().mockResolvedValue(result);
 const api=express.Router();api.use(createDelegationGuard({secret,repository:()=>({consume:async()=>true})}));api.use(createRbacMiddleware({checkServices}));
 api.post('/studio/ai/generate-image',authMiddleware,handler);
 const app=express();app.use(express.json());app.use('/api',api);app.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode || 500).json({code:err.code}));return {app,handler,checkServices};
}
describe('RBAC da ação delegada',()=>{
 const send=(app:any)=>request(app).post('/api/studio/ai/generate-image').set('Authorization',`Bearer ${token}`).set('X-Chat-Approval-Id',approval).send({prompt:'teste'});
 it('bloqueia módulo negado',async()=>{const {app,handler,checkServices}=server('blocked');expect((await send(app)).status).toBe(403);expect(handler).not.toHaveBeenCalled();expect(checkServices).toHaveBeenCalledWith('user',expect.arrayContaining(['studio','studio.ai']));});
 it('encaminha identidade no módulo permitido',async()=>{const {app,handler}=server('allowed');const res=await send(app);expect(res.status).toBe(200);expect(res.body).toMatchObject(user);expect(handler).toHaveBeenCalledOnce();});
 it('recusa usuário excluído',async()=>{const {app,handler}=server('unknown_user');expect((await send(app)).status).toBe(401);expect(handler).not.toHaveBeenCalled();});
});
