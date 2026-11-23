/*
Funcionalidade: editar uma imagem com versão aprovada
Cenário: edição válida
Dado um criativo e uma versão
Quando a edição é solicitada
Então a API encaminha a versão e as instruções
Cenário: entrada inválida
Dado uma versão ausente
Quando a edição é solicitada
Então a API rejeita sem chamar o serviço
*/
import {describe,it,expect,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import { StudioAiController } from '../controllers/studio-ai.controller.js';
const id='11111111-1111-4111-8111-111111111111';
function app(edit:any) {
 const controller=new StudioAiController({editChatImage:edit} as any);
 const server=express(); server.use(express.json());
 server.use((req,_res,next)=>{req.tenant={tenantId:'tenant'};next();});
 server.post('/chat-edit',controller.chatEdit);
 server.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode || 500).json({code:err.code}));
 return server;
}
describe('edição de imagem pelo chat',()=>{
 it('encaminha dados válidos',async()=>{const edit=vi.fn().mockResolvedValue({assetId:'new'});expect((await request(app(edit)).post('/chat-edit').send({assetId:id,version:'123',feedback:'mude o fundo'})).status).toBe(200);expect(edit).toHaveBeenCalledWith('tenant',{assetId:id,version:'123',feedback:'mude o fundo'});});
 it('rejeita versão ausente',async()=>{const edit=vi.fn();expect((await request(app(edit)).post('/chat-edit').send({assetId:id,feedback:'mude o fundo'})).status).toBe(400);expect(edit).not.toHaveBeenCalled();});
});
