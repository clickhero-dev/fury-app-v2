import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createChatReadRouter } from '../routes/chat-read.routes.js';
import { ChatReadCapabilities } from '../services/chat/chat-read-capabilities.js';
import { createDelegationGuard } from '../middleware/chat-delegation.middleware.js';
import { createRbacMiddleware, resolveServiceKeys } from '../middleware/rbac.middleware.js';
import { createChatDelegation } from '../lib/chat-delegation.js';
import { RbacService } from '../services/core/rbac.service.js';
import { errorHandler, AppError } from '../middleware/errorHandler.js';

const secret='01234567890123456789012345678901';
const token=createChatDelegation({userId:'user-a',tenantId:'tenant-a',email:'a@example.com',role:'admin'},secret);
function setup(blocked=false) {
 const quota=vi.fn(async (_t: string) => ({ images:{limit:1,remaining:0} }));
 const meta=vi.fn(async (_t: string) => ({status:'partial'}));
 const rbac={checkServices:vi.fn(async () => blocked ? 'blocked' as const : 'allowed' as const)};
 const app=express(); app.use('/api',createDelegationGuard({secret,repository:()=>({} as any)}),createRbacMiddleware(rbac),createChatReadRouter(() => ({quota,meta} as any), rbac)); app.use(errorHandler);
 return {app,quota,meta};
}
describe('rotas delegadas de leitura',()=>{
 it.each([
   {name:'role video blocked', roleBlocked:['studio.video'], planBlocked:[], images:true, videos:false},
   {name:'plan image blocked', roleBlocked:[], planBlocked:['studio.image'], images:false, videos:true},
   {name:'both allowed', roleBlocked:[], planBlocked:[], images:true, videos:true},
   {name:'both blocked across role and plan', roleBlocked:['studio.image'], planBlocked:['studio.video'], images:false, videos:false},
 ])('$name', async ({roleBlocked, planBlocked, images, videos}) => {
   const repo={findUserContext:vi.fn(async () => ({platformRole:'user_partner', partnerId:'p', role:'member', tenantId:'tenant-a'})), listBlockedServiceKeys:vi.fn(async()=>roleBlocked), listBlockedViewKeys:vi.fn(async()=>[]), listPlanBlockedViewKeys:vi.fn(async()=>planBlocked)};
   const rbac=new RbacService(repo, () => ({status:'down'} as any));
   const deps={subscription:vi.fn(async()=>({creativesLimit:5,creativesRemaining:2})),videos:vi.fn(async()=>({videosLimit:9,videosRemaining:8})),connection:vi.fn(),decrypt:vi.fn(),permissions:vi.fn(),account:vi.fn(),page:vi.fn(),instagram:vi.fn(),link:vi.fn()} as any;
   const app=express(); app.use('/api',createDelegationGuard({secret,repository:()=>({} as any)}),createRbacMiddleware(rbac),createChatReadRouter(() => new ChatReadCapabilities(deps),rbac)); app.use(errorHandler);
   const res=await request(app).get('/api/studio/chat-quotas').set('Authorization','Bearer '+token);
   if (!images && !videos) { expect(res.status).toBe(403); expect(deps.subscription).not.toHaveBeenCalled(); return; }
   expect(res.status).toBe(200);
   expect(res.body.data).toEqual({subscription:'active',images:images?{limit:5,remaining:2}:null,videos:videos?{limit:9,remaining:8}:null});
   expect(deps.subscription).toHaveBeenCalledWith('tenant-a',images);
   expect(deps.videos).toHaveBeenCalledTimes(videos?1:0);
   expect(repo.listPlanBlockedViewKeys).toHaveBeenCalledWith('tenant-a');
 });
 it.each(['missing','expired'] as const)('partial permission with %s subscription does not read either quota', async status => {
   const checkServices=vi.fn(async (_user:string, keys:string[])=>keys.includes('studio.image')?'blocked' as const:'allowed' as const);
   const deps={subscription:vi.fn(async()=>status==='missing'?null:{status:'expired' as const}),videos:vi.fn(),connection:vi.fn(),decrypt:vi.fn(),permissions:vi.fn(),account:vi.fn(),page:vi.fn(),instagram:vi.fn(),link:vi.fn()} as any;
   const app=express(); app.use('/api',createDelegationGuard({secret,repository:()=>({} as any)}),createRbacMiddleware({checkServices}),createChatReadRouter(() => new ChatReadCapabilities(deps),{checkServices})); app.use(errorHandler);
   const res=await request(app).get('/api/studio/chat-quotas').set('Authorization','Bearer '+token);
   expect(res.status).toBe(200); expect(res.body.data).toEqual({subscription:status,images:null,videos:null}); expect(deps.subscription).toHaveBeenCalledWith('tenant-a',false); expect(deps.videos).not.toHaveBeenCalled();
 });
 it.each(['unknown_user','failure'] as const)('fails closed when quota permission check returns %s', async scenario => {
   const checkServices=vi.fn(async (_user:string, keys:string[])=>{
     if (keys.length===1) return 'allowed' as const;
     if (scenario==='failure') throw new Error('private');
     return 'unknown_user' as const;
   });
   const quota=vi.fn(),meta=vi.fn();
   const app=express();app.use('/api',createDelegationGuard({secret,repository:()=>({} as any)}),createRbacMiddleware({checkServices}),createChatReadRouter(() => ({quota,meta} as any),{checkServices}));app.use(errorHandler);
   const res=await request(app).get('/api/studio/chat-quotas').set('Authorization','Bearer '+token);
   expect(res.status).toBe(scenario==='failure'?503:401);expect(quota).not.toHaveBeenCalled();expect(JSON.stringify(res.body)).not.toContain('private');
 });
 it('retorna somente a cota de imagem quando vídeo está bloqueado', async () => {
   const checkServices = vi.fn(async (_user: string, keys: string[]) => keys.includes('studio.video') ? 'blocked' : 'allowed');
   const deps = {subscription: vi.fn(async () => ({creativesLimit:5, creativesRemaining:2})), videos: vi.fn(async () => ({videosLimit:99, videosRemaining:88})), connection:vi.fn(), decrypt:vi.fn(), permissions:vi.fn(), account:vi.fn(), page:vi.fn(), instagram:vi.fn(), link:vi.fn()} as any;
   const app=express(); app.use('/api',createDelegationGuard({secret,repository:()=>({} as any)}),createRbacMiddleware({checkServices} as any),createChatReadRouter(() => new ChatReadCapabilities(deps), {checkServices} as any)); app.use(errorHandler);
   const r=await request(app).get('/api/studio/chat-quotas').set('Authorization','Bearer '+token);
   expect(r.status).toBe(200); expect(r.body.data).toEqual({subscription:'active',images:{limit:5,remaining:2},videos:null});
   expect(deps.videos).not.toHaveBeenCalled();
 });
 it('exige autenticação e RBAC',async()=>{const {app}=setup(); expect((await request(app).get('/api/studio/chat-quotas')).status).toBe(401); const b=setup(true);expect((await request(b.app).get('/api/studio/chat-quotas').set('Authorization','Bearer '+token)).status).toBe(403);});
 it('ignora tenant externo e rejeita qualquer query',async()=>{const {app,quota}=setup(); const r=await request(app).get('/api/studio/chat-quotas?tenantId=tenant-b').set('Authorization','Bearer '+token);expect(r.status).toBe(400);expect(quota).not.toHaveBeenCalled();});
 it('consulta exclusivamente tenant da credencial e protege RBAC',async()=>{const {app,meta}=setup(); const r=await request(app).get('/api/meta/chat-ads-diagnostic').set('Authorization','Bearer '+token);expect(r.status).toBe(200);expect(meta).toHaveBeenCalledWith('tenant-a');expect(resolveServiceKeys('/studio/chat-quotas')).toEqual(['studio']);expect(resolveServiceKeys('/meta/chat-ads-diagnostic')).toContain('meta');});
 it('integra guard e serviços reais com adapters fake por tenant',async()=>{
   const deps={subscription:vi.fn(async (tenant:string)=>tenant==='tenant-a'?{creativesLimit:2,creativesRemaining:0}:null), videos:vi.fn(async()=>({videosLimit:1,videosRemaining:1})), connection:vi.fn(async()=>null), decrypt:vi.fn(), permissions:vi.fn(), account:vi.fn(), page:vi.fn(), instagram:vi.fn(), link:vi.fn()};
   const rbac={checkServices:vi.fn(async()=> 'allowed' as const)};
   const app=express(); app.use('/api',createDelegationGuard({secret,repository:()=>({} as any)}),createRbacMiddleware(rbac),createChatReadRouter(() => new ChatReadCapabilities(deps),rbac)); app.use(errorHandler);
   const a=await request(app).get('/api/studio/chat-quotas').set('Authorization','Bearer '+token); expect(a.body.data.images.remaining).toBe(0);
   const bToken=createChatDelegation({userId:'user-b',tenantId:'tenant-b',email:'b@example.com',role:'admin'},secret);
   const b=await request(app).get('/api/studio/chat-quotas').set('Authorization','Bearer '+bToken);expect(b.body.data.images).toBeNull();expect(deps.videos).toHaveBeenCalledTimes(1);
 });
 it('does not expose service error details to the delegated client',async()=>{
   const {app,meta}=setup(); meta.mockRejectedValueOnce(new AppError(502,'META_ERROR','secret provider token',{token:'secret'}));
   const r=await request(app).get('/api/meta/chat-ads-diagnostic').set('Authorization','Bearer '+token);
   expect(r.status).toBe(500); expect(JSON.stringify(r.body)).not.toContain('secret');
 });
 it('não permite ações de escrita',async()=>{const {app}=setup(); expect((await request(app).post('/api/meta/chat-ads-diagnostic').set('Authorization','Bearer '+token)).status).toBe(403);});
});
