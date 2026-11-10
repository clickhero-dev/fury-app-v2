/* Funcionalidade: consultar fotos da marca para vídeos com identidade delegada.
Cenário: páginas e filtros preservam o tenant; limite inválido é recusado.
Cenário: somente leitura e RBAC da marca se aplicam. */
import {describe,it,expect,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import {BrandKitPhotoController} from '../controllers/brand-kit-photo.controller.js';
import {createDelegationGuard} from '../middleware/chat-delegation.middleware.js';
import {createChatDelegation} from '../lib/chat-delegation.js';
import {createRbacMiddleware} from '../middleware/rbac.middleware.js';
const secret='test-secret-with-sufficient-entropy-1234567890';
const token=createChatDelegation({userId:'u1',tenantId:'t1',email:'a@example.com',role:'user'},secret);
function setup(permissions='allowed'){
 const list=vi.fn().mockResolvedValue({items:[{id:'photo'}],page:2,hasMore:true,nextPage:3});
 const rbac=vi.fn().mockResolvedValue(permissions);
 const controller=new BrandKitPhotoController({listChat:list} as any);
 const app=express();app.use(createDelegationGuard({secret,repository:()=>({consume:vi.fn()})}));
 app.use('/api',createRbacMiddleware({checkServices:rbac} as any));
 app.use((req,_res,next)=>{req.tenant={tenantId:'t1'};next();});
 app.get('/api/brand-kit/chat-library',controller.listChat);
 app.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode||500).json({code:err.code}));
 return {app,list,rbac};
}
describe('biblioteca delegada',()=>{
 it('encaminha página e tenant e aplica RBAC',async()=>{const {app,list,rbac}=setup();const res=await request(app).get('/api/brand-kit/chat-library?kind=produto&page=2&limit=20').set('Authorization',`Bearer ${token}`);expect(res.status).toBe(200);expect(res.body.data).toEqual({items:[{id:'photo'}],page:2,hasMore:true,nextPage:3});expect(list).toHaveBeenCalledWith('t1','produto',2,20);expect(rbac).toHaveBeenCalledWith('u1',['brand_kit']);});
 it('bloqueia serviço sem permissão e limite inválido',async()=>{const denied=setup('blocked');expect((await request(denied.app).get('/api/brand-kit/chat-library').set('Authorization',`Bearer ${token}`)).status).toBe(403);expect(denied.list).not.toHaveBeenCalled();const valid=setup();expect((await request(valid.app).get('/api/brand-kit/chat-library?limit=51').set('Authorization',`Bearer ${token}`)).status).toBe(400);expect(valid.list).not.toHaveBeenCalled();});
 it('bloqueia mutação delegada',async()=>{const {app,list}=setup();expect((await request(app).post('/api/brand-kit/chat-library').set('Authorization',`Bearer ${token}`)).status).toBe(403);expect(list).not.toHaveBeenCalled();});
});
