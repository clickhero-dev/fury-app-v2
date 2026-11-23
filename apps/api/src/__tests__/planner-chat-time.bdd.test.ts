/*
Funcionalidade: confirmar agendamento futuro pelo chatbot
Cenário: agendamento válido
Dado uma postagem aprovada com horário futuro
Quando o chatbot confirma a postagem
Então ela é criada no horário indicado
Cenário: horário expirou antes da confirmação
Dado uma proposta cujo horário já passou
Quando o chatbot tenta confirmá-la
Então a API recusa e não cria a postagem
Cenário: preservar edição manual existente
Dado um pedido direto do usuário
Quando o horário informado está no passado
Então o fluxo manual mantém o comportamento anterior
*/
import {describe,it,expect,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
vi.mock('../middleware/chat-delegation.middleware.js',()=>({getDelegatedUser:(req:any)=>req.user?.role==='delegated' ? req.user : undefined}));
import {PlannerController} from '../controllers/planner.controller.js';
function server(create:any, role='delegated') {
 const controller=new PlannerController({createManualPost:create} as any);
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.tenant={tenantId:'tenant'};req.user={userId:'user',tenantId:'tenant',email:'a@example.com',role};next();});
 app.post('/posts',controller.handleCreatePost);
 app.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode || 500).json({code:err.code}));return app;
}
const body=(at:string)=>({date:at.slice(0,10),scheduledAt:at,postType:'image',platform:'instagram',caption:'Teste',imageUrl:'https://example.com/a.png'});
describe('horário de postagem delegada',()=>{
 it('cria postagem em horário futuro',async()=>{const create=vi.fn().mockResolvedValue({id:'post'});const date=new Date(Date.now()+3600000).toISOString();expect((await request(server(create)).post('/posts').send(body(date))).status).toBe(200);expect(create).toHaveBeenCalledOnce();});
 it('recusa horário expirado sem criar',async()=>{const create=vi.fn();const date=new Date(Date.now()-1000).toISOString();expect((await request(server(create)).post('/posts').send(body(date))).status).toBe(400);expect(create).not.toHaveBeenCalled();});
 it('recusa ausência de horário e plataforma não autorizada',async()=>{const create=vi.fn();const date=new Date(Date.now()+3600000).toISOString();const {scheduledAt:_,...missing}=body(date);expect((await request(server(create)).post('/posts').send(missing)).status).toBe(400);expect((await request(server(create)).post('/posts').send({...body(date),platform:'facebook'})).status).toBe(400);expect(create).not.toHaveBeenCalled();});
 it('preserva fluxo manual',async()=>{const create=vi.fn().mockResolvedValue({id:'post'});const date=new Date(Date.now()-1000).toISOString();expect((await request(server(create,'member')).post('/posts').send(body(date))).status).toBe(200);expect(create).toHaveBeenCalledOnce();});
});
