/*
Funcionalidade: preservar privacidade e identificar ações delegadas
Cenário: não registrar texto privado da conversa
Dado uma mensagem enviada ao chat
Quando o request logger registra a solicitação
Então não persiste o corpo ou a query
Cenário: identificar ação do chatbot com segurança
Dado uma identidade delegada verificada
Quando a solicitação é registrada
Então o ator chatbot e a aprovação ficam identificados sem gravar o token
Cenário: impedir falsificação de auditoria
Dado um cabeçalho de ator forjado por um cliente comum
Quando o logger registra a solicitação
Então identifica o ator como usuário
Cenário: proteger dados de ferramentas delegadas rejeitadas
Dado um pedido de ferramenta com aprovação inválida
Quando a solicitação é registrada
Então o corpo e a query não são persistidos nem o ator é autenticado pelo cabeçalho
*/
import {describe,it,expect,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
const {inserted}=vi.hoisted(()=>({inserted:[] as any[]}));
vi.mock('@fury/db',()=>({db:{insert:()=>({values:async (v:any[])=>{inserted.push(...v);}})},requestLogs:{}}));
vi.mock('../middleware/chat-delegation.middleware.js',()=>({getDelegatedUser:(req:any)=>req.user?.role==='delegated' ? req.user : undefined}));
import {requestLogger,flushRequestLogs} from '../middleware/request-logger.js';
function server(role='member') {const app=express();app.use(express.json());app.use(requestLogger);app.use((req,_res,next)=>{req.user={userId:'u',tenantId:'t',email:'a@example.com',role};next();});app.use((_req,res)=>res.json({ok:true}));return app;}
describe('auditoria do chatbot',()=>{
 it('não registra corpo ou query de chat',async()=>{inserted.length=0;await request(server()).post('/api/chat/conversations/123/messages?contexto=privado').send({content:'segredo íntimo'});await flushRequestLogs();expect(inserted[0].requestBody).toBeNull();expect(inserted[0].queryString).toBeNull();expect(JSON.stringify(inserted[0])).not.toContain('segredo íntimo');});
 it('marca ator e aprovação validados',async()=>{inserted.length=0;await request(server('delegated')).post('/api/planner/posts').set('authorization','Bearer secret').set('x-chat-approval-id','11111111-1111-4111-8111-111111111111').send({});await flushRequestLogs();expect(inserted[0].requestHeaders._ady_actor).toBe('chatbot');expect(inserted[0].requestHeaders._ady_approval_id).toBe('11111111-1111-4111-8111-111111111111');expect(JSON.stringify(inserted[0])).not.toContain('Bearer secret');});
 it('não registra parâmetros ou corpo de ferramenta delegada',async()=>{inserted.length=0;await request(server('delegated')).post('/api/studio/ai/generate-image?texto=privado').send({prompt:'segredo íntimo'});await flushRequestLogs();expect(inserted[0].requestBody).toBeNull();expect(inserted[0].queryString).toBeNull();expect(JSON.stringify(inserted[0])).not.toContain('segredo íntimo');expect(JSON.stringify(inserted[0])).not.toContain('texto=privado');});
 it('oculta dados mesmo quando a aprovação delegada é rejeitada',async()=>{inserted.length=0;await request(server()).post('/api/studio/ai/generate-image?texto=privado').set('x-chat-approval-id','invalid').send({prompt:'segredo íntimo'});await flushRequestLogs();expect(inserted[0].requestBody).toBeNull();expect(inserted[0].queryString).toBeNull();expect(inserted[0].requestHeaders._ady_actor).toBe('user');});
 it('não confia em ator enviado pelo cliente',async()=>{inserted.length=0;await request(server()).get('/api/planner/calendar').set('_ady_actor','chatbot').set('x-chat-approval-id','11111111-1111-4111-8111-111111111111');await flushRequestLogs();expect(inserted[0].requestHeaders._ady_actor).toBe('user');expect(inserted[0].requestHeaders._ady_approval_id).toBeUndefined();});
});
