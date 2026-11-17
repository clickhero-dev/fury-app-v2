/*
Funcionalidade: alterar marca com versão aprovada
Cenário: atualizar cores de uma versão válida
Dado uma versão da marca consultada
Quando a alteração é confirmada
Então o serviço recebe os valores e a versão
Cenário: rejeitar valor inválido
Dado uma cor inválida
Quando a alteração é solicitada
Então a API rejeita a entrada
Cenário: rejeitar versão obsoleta
Dado que a marca mudou depois da consulta
Quando a versão antiga é usada
Então a API retorna conflito
*/
import { describe,it,expect,vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { BrandKitController } from '../controllers/brand-kit.controller.js';
function app(update: any) {
 const ctrl = new BrandKitController({updateChatBrand:update} as any);
 const server = express(); server.use(express.json());
 server.use((req,_res,next) => { req.tenant={tenantId:'tenant'}; next(); });
 server.patch('/chat-update',ctrl.chatUpdate);
 server.use((err: any,_req: any,res: any,_next: any) => res.status(err.statusCode || (err.name === 'ZodError' ? 400 : 500)).json({code:err.code}));
 return server;
}
describe('marca com versão', () => {
 it('envia a versão e valores aprovados', async () => {
   const update=vi.fn().mockResolvedValue({id:'id'});
   expect((await request(app(update)).patch('/chat-update').send({version:'123',primary_color:'#123456'})).status).toBe(200);
   expect(update).toHaveBeenCalledWith('tenant','123',{primaryColor:'#123456'});
 });
 it('rejeita dados inválidos', async () => {
   const update=vi.fn(); expect((await request(app(update)).patch('/chat-update').send({version:'123',primary_color:'bad'})).status).toBe(400); expect(update).not.toHaveBeenCalled();
 });
 it('retorna conflito para versão antiga', async () => {
   const update=vi.fn().mockRejectedValue(Object.assign(new Error('conflict'),{statusCode:409}));
   expect((await request(app(update)).patch('/chat-update').send({version:'123',primary_color:'#123456'})).status).toBe(409);
 });
 it('permite atualizar número WhatsApp válido', async () => {
   const update=vi.fn().mockResolvedValue({id:'id'});
   expect((await request(app(update)).patch('/chat-update').send({version:'123',whatsapp_number:'5511999999999'})).status).toBe(200);
   expect(update).toHaveBeenCalledWith('tenant','123',{whatsappNumber:'5511999999999'});
 });
});
