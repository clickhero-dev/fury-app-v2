/*
Funcionalidade: confirmar ações de campanha
Cenário: pausar com versão válida
Dado uma versão da campanha consultada
Quando a pausa é confirmada
Então o controlador encaminha a ação e a versão
Cenário: dados inválidos
Dado orçamento abaixo do mínimo
Quando a ação é solicitada
Então a API rejeita a entrada
*/
import {describe,it,expect,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import {CampaignsController} from '../controllers/campaigns.controller.js';
import {createDelegationGuard} from '../middleware/chat-delegation.middleware.js';
import {createChatDelegation} from '../lib/chat-delegation.js';
vi.mock('../lib/http-cache.js',()=>({invalidateHttpCache:vi.fn().mockResolvedValue(undefined)}));
const id='11111111-1111-4111-8111-111111111111',version='a'.repeat(64);
function app(update:any){
 const controller=new CampaignsController({updateChatCampaign:update,updateChatAd:update,createChatAd:update} as any);
 const server=express();server.use(express.json());server.use((req,_res,next)=>{req.tenant={tenantId:'t1'};next();});
 server.patch('/:id/chat-update',controller.chatUpdate);
 server.patch('/:id/chat-ads/:adId',controller.chatAdUpdate);
 server.post('/:id/chat-ads-create',controller.chatAdCreate);
 server.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode || (err.name==='ZodError'?400:500)).json({code:err.code}));return server;
}
describe('rota de confirmação Meta',()=>{
 it('aplica moeda BRL somente à criação com identidade delegada verificada',async()=>{
  const create=vi.fn().mockResolvedValue({id:'campaign'}),secret='test-secret-with-sufficient-entropy-1234567890';
  const controller=new CampaignsController({createCampaign:create} as any);
  const server=express();server.use(express.json());server.use((req,_res,next)=>{req.tenant={tenantId:'t1'};next();});
  server.use(createDelegationGuard({secret,repository:()=>({consume:vi.fn().mockResolvedValue(true)}) as any}));
  server.post('/api/campaigns/create',controller.createCampaign);
  const body={name:'Campanha',objective:'OUTCOME_SALES',dailyBudget:1000,adAccountId:'act_123'};
  const token=createChatDelegation({userId:'u1',tenantId:'t1',email:'a@example.com',role:'admin'},secret);
  expect((await request(server).post('/api/campaigns/create').set('Authorization',`Bearer ${token}`).set('X-Chat-Approval-Id',id).send(body)).status).toBe(201);
  expect(create).toHaveBeenLastCalledWith(expect.objectContaining({enforceBrl:true}));
  expect((await request(server).post('/api/campaigns/create').send(body)).status).toBe(201);
  expect(create).toHaveBeenLastCalledWith(expect.objectContaining({enforceBrl:false}));
 });
 it('encaminha pausa com versão',async()=>{const update=vi.fn().mockResolvedValue({status:'PAUSED'});expect((await request(app(update)).patch(`/${id}/chat-update`).send({version,action:'pause'})).status).toBe(200);expect(update).toHaveBeenCalledWith({tenantId:'t1',campaignId:id,version,action:'pause'});});
 it('rejeita orçamento inválido',async()=>{const update=vi.fn();expect((await request(app(update)).patch(`/${id}/chat-update`).send({version,action:'budget',dailyBudget:1})).status).toBe(400);expect(update).not.toHaveBeenCalled();});
 it('encaminha pausa do anúncio',async()=>{const update=vi.fn().mockResolvedValue({id:'123',status:'PAUSED'});expect((await request(app(update)).patch(`/${id}/chat-ads/123`).send({version,action:'pause'})).status).toBe(200);expect(update).toHaveBeenCalledWith({tenantId:'t1',campaignId:id,adId:'123',version,action:'pause'});});
 it('encaminha criação individual pausada',async()=>{const update=vi.fn().mockResolvedValue({id:'123',status:'PAUSED'});expect((await request(app(update)).post(`/${id}/chat-ads-create`).send({version,name:'Novo anúncio',adsetId:'200',creativeId:'300'})).status).toBe(201);expect(update).toHaveBeenCalledWith({tenantId:'t1',campaignId:id,version,name:'Novo anúncio',adsetId:'200',creativeId:'300'});});
});
