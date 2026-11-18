/*
Funcionalidade: atualizar perfil e negócio pelo assistente
Cenário: consultar perfil do usuário autenticado
Dado um usuário autenticado
Quando consulta o snapshot
Então o serviço recebe usuário e tenant da sessão
Cenário: atualizar dados aprovados
Dado versões do perfil e do negócio
Quando a atualização é solicitada
Então o serviço recebe apenas os campos permitidos
Cenário: rejeitar credenciais e entradas vazias
Dado uma alteração de senha ou sem campos
Quando é solicitada
Então a API responde 400 sem modificar dados
*/
import {describe,it,expect,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import {ChatProfileController} from '../controllers/chat-profile.controller.js';
function app(svc:any){const c=new ChatProfileController(svc);const server=express();server.use(express.json());server.use((req,_res,next)=>{req.user={userId:'u',tenantId:'t',email:'a@b.com',role:'member'};req.tenant={tenantId:'t'};next();});server.get('/snapshot',c.snapshot);server.patch('/update',c.update);server.post('/guided-update',c.guidedUpdate);server.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode || (err.name==='ZodError'?400:500)).json({code:err.code}));return server;}
describe('perfil seguro',()=>{
 it('consulta identidade da sessão',async()=>{const snapshot=vi.fn().mockResolvedValue({name:'Ana'});expect((await request(app({snapshot})).get('/snapshot')).status).toBe(200);expect(snapshot).toHaveBeenCalledWith('t','u');});
 it('encaminha dados e versões',async()=>{const update=vi.fn().mockResolvedValue({});expect((await request(app({update})).patch('/update').send({userVersion:'1',tenantVersion:'2',name:'Ana',businessContext:'Café'})).status).toBe(200);expect(update).toHaveBeenCalledWith('t','u','1','2',{name:'Ana',businessContext:'Café'});});
 it('recusa senha e requisição sem campos',async()=>{const update=vi.fn();for(const body of [{userVersion:'1',tenantVersion:'2',password:'x'},{userVersion:'1',tenantVersion:'2'}]) expect((await request(app({update})).patch('/update').send(body)).status).toBe(400);expect(update).not.toHaveBeenCalled();});
 it('persiste nome e oferta com fence obrigatório',async()=>{const applyGuidedBusinessContext=vi.fn().mockResolvedValue({tenantName:'Loja Ana',businessContext:'Produtos ou serviços: Flores'});const conversationId='11111111-1111-4111-8111-111111111111',runId='22222222-2222-4222-8222-222222222222',leaseId='33333333-3333-4333-8333-333333333333';const result=await request(app({applyGuidedBusinessContext})).post('/guided-update').send({tenantName:'Loja Ana',businessContext:'Produtos ou serviços: Flores',conversationId,runId,leaseId});expect(result.status).toBe(200);expect(applyGuidedBusinessContext).toHaveBeenCalledWith('t','u',{tenantName:'Loja Ana',businessContext:'Produtos ou serviços: Flores'},{conversationId,runId,leaseId});});
 it('rejeita fence ausente/inválido e versões fornecidas pelo cliente',async()=>{const applyGuidedBusinessContext=vi.fn();const server=app({applyGuidedBusinessContext});const payload={tenantName:'Loja',businessContext:'Café'};expect((await request(server).post('/guided-update').send(payload)).status).toBe(400);expect((await request(server).post('/guided-update').send({...payload,conversationId:'bad',runId:'bad',leaseId:'bad'})).status).toBe(400);expect((await request(server).post('/guided-update').send({...payload,conversationId:'11111111-1111-4111-8111-111111111111',runId:'22222222-2222-4222-8222-222222222222',leaseId:'33333333-3333-4333-8333-333333333333',userVersion:'1'})).status).toBe(400);expect(applyGuidedBusinessContext).not.toHaveBeenCalled();});
});
