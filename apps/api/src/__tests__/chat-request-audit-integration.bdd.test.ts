/*
Funcionalidade: auditoria de identidade delegada
Cenário: pedido real do chatbot
Dado um JWT delegado e aprovação verificados
Quando uma ferramenta retorna sucesso
Então o logger identifica o chatbot sem persistir prompt nem token
Cenário: pedido delegado rejeitado
Dado uma aprovação inválida
Quando a ferramenta rejeita a chamada
Então o prompt continua omitido dos logs
*/
import {describe,it,expect,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
const {inserted}=vi.hoisted(()=>({inserted:[] as any[]}));
vi.mock('@fury/db',async importOriginal=>({...await importOriginal(),db:{insert:()=>({values:async(v:any[])=>{inserted.push(...v);}})}}));
import {requestLogger,flushRequestLogs} from '../middleware/request-logger.js';
import {createDelegationGuard} from '../middleware/chat-delegation.middleware.js';
import {createChatDelegation} from '../lib/chat-delegation.js';
import {authMiddleware} from '../middleware/auth.middleware.js';
const secret='test-secret-with-sufficient-entropy-1234567890';
const user={userId:'u1',tenantId:'t1',email:'a@example.com',role:'member'};
const token=createChatDelegation(user,secret),approval='11111111-1111-4111-8111-111111111111';
function server(approved:boolean){const app=express();app.use(express.json());app.use(requestLogger);app.use(createDelegationGuard({secret,repository:()=>({consume:async()=>approved})}));app.post('/api/studio/ai/generate-image',authMiddleware,(_req,res)=>res.json({ok:true}));app.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode || 500).json({code:err.code}));return app;}
describe('auditoria real do chatbot',()=>{
 it('identifica delegação validada e oculta texto',async()=>{inserted.length=0;const res=await request(server(true)).post('/api/studio/ai/generate-image?private=1').set('Authorization',`Bearer ${token}`).set('X-Chat-Approval-Id',approval).send({prompt:'texto privado'});expect(res.status).toBe(200);await flushRequestLogs();expect(inserted[0].requestHeaders._ady_actor).toBe('chatbot');expect(inserted[0].requestHeaders._ady_approval_id).toBe(approval);expect(inserted[0].userId).toBe('u1');expect(inserted[0].requestBody).toBeNull();expect(inserted[0].queryString).toBeNull();expect(JSON.stringify(inserted[0])).not.toContain('texto privado');});
 it('oculta texto mesmo após rejeição da aprovação',async()=>{inserted.length=0;const res=await request(server(false)).post('/api/studio/ai/generate-image?private=1').set('Authorization',`Bearer ${token}`).set('X-Chat-Approval-Id',approval).send({prompt:'texto privado'});expect(res.status).toBe(403);await flushRequestLogs();expect(inserted[0].requestBody).toBeNull();expect(inserted[0].queryString).toBeNull();expect(JSON.stringify(inserted[0])).not.toContain('texto privado');});
});
