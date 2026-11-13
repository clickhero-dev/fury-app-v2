/*
Funcionalidade: consumo de aprovação no PostgreSQL
Cenário: chamadas simultâneas executam apenas uma vez
Dado uma aprovação válida para um usuário e tenant
Quando duas chamadas tentam consumi-la
Então exatamente uma obtém autorização
Cenário: outro tenant ou parâmetros modificados não consomem a aprovação
Dado uma aprovação válida
Quando a chamada diverge do tenant ou do corpo aprovado
Então ela é recusada
Cenário: gerar uma imagem aprovada uma única vez
Dado um pedido de imagem aprovado
Quando o chatbot chama o controlador de geração
Então a imagem é solicitada uma vez e a repetição é recusada
Cenário: consumir e estornar cota de imagem
Dado um usuário com cota limitada e aprovações válidas
Quando a geração é bem-sucedida ou falha no provedor
Então a cota é consumida no sucesso e estornada na falha
Cenário: bloquear geração sem cota
Dado um usuário sem cota de imagem
Quando ele confirma uma geração
Então a API bloqueia antes de chamar o provedor
Cenário: cancelar apenas a versão do post apresentada
Dado um post agendado que foi alterado após a consulta
Quando a versão antiga é usada no cancelamento
Então o banco rejeita a alteração até uma nova consulta
Cenário: registrar sucesso após resultado inicialmente desconhecido
Dado que uma resposta foi perdida e a ação depois retorna sucesso
Quando a confirmação tardia é registrada
Então o status é concluído sem apagar o resultado real
Cenário: proteger estados terminais em concorrência
Dado que a marcação de sucesso e a de resultado desconhecido competem
Quando ambas terminam
Então o sucesso prevalece e falhas terminais não são sobrescritas
*/
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import { ChatApprovalRepository } from '../repository/chat-approval.repository.js';
import { createDelegationGuard } from '../middleware/chat-delegation.middleware.js';
import { createChatDelegation } from '../lib/chat-delegation.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { StudioAiController, IMAGE_MODEL_IDS } from '../controllers/studio-ai.controller.js';
import express from 'express';
import request from 'supertest';
import { PlannerRepository } from '../repository/planner.repository.js';
import { ChatBrandRepository } from '../repository/chat-brand.repository.js';
import { StudioRepository } from '../repository/studio.repository.js';
import { ChatMetaLockRepository } from '../repository/chat-meta-lock.repository.js';
import { ChatProfileRepository } from '../repository/chat-profile.repository.js';
import { ChatProfileService } from '../services/core/chat-profile.service.js';
import { ChatProfileController } from '../controllers/chat-profile.controller.js';
import { WorkflowJobRepository } from '../repository/workflow-job.repository.js';
import { StudioAiService } from '../services/studio/studio-ai.service.js';
import { SubscriptionRepository } from '../repository/subscription.repository.js';
import { AppError } from '../middleware/errorHandler.js';
import * as dbSchema from '@fury/db';

const url = process.env.TEST_CHAT_DATABASE_URL;
describe.skipIf(!url)('aprovação no PostgreSQL isolado', () => {
 const client = postgres(url!, { max: 4 });
 const db = drizzle(client, { schema: dbSchema }) as any;
 const tenantId = randomUUID(), userId = randomUUID(), conversationId = randomUUID(), approvalId = randomUUID();
 const action = { tenantId, userId, approvalId, method:'POST', path:'/api/planner/posts', body:{text:'aprovado'} };
 beforeAll(async () => {
   await client`insert into tenants (id,name,slug) values (${tenantId},'test',${tenantId})`;
   await client`insert into users (id,tenant_id,email) values (${userId},${tenantId},${userId + '@test.invalid'})`;
   await client`insert into chat_conversations (id,tenant_id,user_id,title) values (${conversationId},${tenantId},${userId},'test')`;
   await client`insert into chat_approvals (id,tenant_id,user_id,conversation_id,method,path,body,status,expires_at) values (${approvalId},${tenantId},${userId},${conversationId},'POST','/api/planner/posts',${JSON.stringify(action.body)}::jsonb,'approved',now() + interval '1 hour')`;
 });
 afterAll(async () => { await client`delete from tenants where id = ${tenantId}`; await client.end(); });
 it('recusa tenant e conteúdo divergentes', async () => {
   expect(await new ChatApprovalRepository(tenantId, db).consume({...action, body:{text:'alterado'}})).toBe(false);
   expect(await new ChatApprovalRepository(randomUUID(), db).consume(action)).toBe(false);
 });
 it('consome uma única vez sob concorrência', async () => {
   const repository = new ChatApprovalRepository(tenantId, db);
   const results = await Promise.all([repository.consume(action), repository.consume(action)]);
   expect(results.filter(Boolean)).toHaveLength(1);
   await repository.complete(approvalId, userId);
   const rows = await client`select status from chat_approvals where id = ${approvalId}`;
   expect(rows[0].status).toBe('completed');
   expect(await repository.consume(action)).toBe(false);
 });
 it('executa geração aprovada na rota real e recusa repetição', async () => {
   const imageApproval = randomUUID();
   const imageBody = { model: IMAGE_MODEL_IDS[0], prompt:'Uma imagem para o café' };
   await client`insert into chat_approvals (id,tenant_id,user_id,conversation_id,method,path,body,status,expires_at) values (${imageApproval},${tenantId},${userId},${conversationId},'POST','/api/studio/ai/generate-image',${JSON.stringify(imageBody)}::jsonb,'approved',now() + interval '1 hour')`;
   const secret = 'test-secret-with-sufficient-entropy-1234567890';
   const token = createChatDelegation({tenantId,userId,email:'test@example.com',role:'member'}, secret);
   const generated: unknown[] = [];
   const controller = new StudioAiController({generateImage: async (tenant: string, body: unknown) => { generated.push({tenant,body}); return {url:'https://example.test/image.png'}; }} as any);
   const server = express(); server.use(express.json());
   server.use(createDelegationGuard({secret,repository: id => new ChatApprovalRepository(id, db)}));
   server.post('/api/studio/ai/generate-image',authMiddleware,tenantMiddleware,controller.generateImage);
   server.use((err: any, _req: any,res: any,_next: any) => res.status(err.statusCode || 500).json({code:err.code}));
   const send = () => request(server).post('/api/studio/ai/generate-image').set('Authorization',`Bearer ${token}`).set('X-Chat-Approval-Id',imageApproval).send(imageBody);
   expect((await send()).status).toBe(200);
   expect((await send()).status).toBe(403);
   expect(generated).toHaveLength(1);
 });
 it('consome cota real de imagem e estorna falha no caminho aprovado do chat', async () => {
   const planId=randomUUID();
   await client`insert into plans (id,name,price_cents) values (${planId},'Plano teste',0)`;
   await client`insert into subscriptions (tenant_id,plan_id,status,creatives_remaining) values (${tenantId},${planId},'active',2)`;
   try {
     const subscription=new SubscriptionRepository(tenantId,db);
     const quota={consumeCreativeQuota:async()=>{if(!await subscription.consumeCreativeQuota()) throw new AppError(403,'CREATIVE_QUOTA_EXCEEDED','Limite atingido');},refundCreativeQuota:async()=>subscription.refundCreativeQuota(),getModificationsPerCreativeLimit:async()=>3};
     const llm={generateImageWithMeta:vi.fn().mockResolvedValue({dataUrl:'data:image/png;base64,AAAA',costUsd:0})};
     const studio={findTenant:async()=>({name:'Teste'}),findBrandKit:async()=>null,createAsset:async(d:any)=>({id:randomUUID(),...d})};
     const controller=new StudioAiController(new StudioAiService(()=>studio as any,llm as any,quota as any));
     const secret='test-secret-with-sufficient-entropy-1234567890', token=createChatDelegation({tenantId,userId,email:'test@example.com',role:'member'},secret);
     const server=express();server.use(express.json());server.use(createDelegationGuard({secret,repository:id=>new ChatApprovalRepository(id,db)}));
     server.post('/api/studio/ai/generate-image',authMiddleware,tenantMiddleware,controller.generateImage);
     server.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode || 500).json({code:err.code,message:err.message}));
     const body={model:IMAGE_MODEL_IDS[0],prompt:'Uma imagem para o café'};
     const approve=async()=>{const id=randomUUID();await client`insert into chat_approvals (id,tenant_id,user_id,conversation_id,method,path,body,status,expires_at) values (${id},${tenantId},${userId},${conversationId},'POST','/api/studio/ai/generate-image',${JSON.stringify(body)}::jsonb,'approved',now()+interval '1 hour')`;return id;};
     const send=async(id:string)=>request(server).post('/api/studio/ai/generate-image').set('Authorization',`Bearer ${token}`).set('X-Chat-Approval-Id',id).send(body);
     const first=await approve();const success=await send(first);expect(success.body).toMatchObject({type:'image'});expect(success.status).toBe(200);
     expect((await client`select creatives_remaining from subscriptions where tenant_id=${tenantId}`)[0].creatives_remaining).toBe(1);
     expect((await send(first)).status).toBe(403);
     llm.generateImageWithMeta.mockRejectedValueOnce(Error('falha provedor'));
     expect((await send(await approve())).status).toBe(500);
     expect((await client`select creatives_remaining from subscriptions where tenant_id=${tenantId}`)[0].creatives_remaining).toBe(1);
     await client`update subscriptions set creatives_remaining=0 where tenant_id=${tenantId}`;
     expect((await send(await approve())).status).toBe(403);
     expect(llm.generateImageWithMeta).toHaveBeenCalledTimes(2);
   } finally { await client`delete from subscriptions where tenant_id=${tenantId}`;await client`delete from plans where id=${planId}`; }
 });
 it('cancela somente a versão agendada apresentada e rejeita alterações concorrentes', async () => {
   const postId = randomUUID();
   await client`insert into social_posts (id,tenant_id,calendar_date,caption,scheduled_at,status) values (${postId},${tenantId},current_date,'primeira',now() + interval '1 day','approved')`;
   const repo = new PlannerRepository(tenantId, db);
   const old = await repo.getChatPostSnapshot(postId);
   expect(old?.version).toBeTruthy();
   await client`update social_posts set caption='alterada' where id=${postId}`;
   expect(await repo.cancelScheduledPostIfVersion(postId, old!.version)).toBeNull();
   const fresh = await repo.getChatPostSnapshot(postId);
   expect(await repo.cancelScheduledPostIfVersion(postId, fresh!.version)).toBeTruthy();
   expect(await repo.cancelScheduledPostIfVersion(postId, fresh!.version)).toBeNull();
 });
 it('atualiza marca somente quando a versão apresentada permanece válida', async () => {
   await client`insert into brand_kits (tenant_id,primary_color,secondary_color) values (${tenantId},'#000000','#ffffff')`;
   const repo = new ChatBrandRepository(tenantId, db);
   const initial = await repo.snapshot();
   expect(initial?.version).toBeTruthy();
   await client`update brand_kits set secondary_color='#123456' where tenant_id=${tenantId}`;
   expect(await repo.updateIfVersion(initial!.version, {primaryColor:'#112233'})).toBeNull();
   const fresh = await repo.snapshot();
   expect(await repo.updateIfVersion(fresh!.version, {primaryColor:'#112233',whatsappNumber:'5511999999999'})).toBeTruthy();
   const after = await repo.snapshot();
   expect(after?.primaryColor).toBe('#112233');
   expect(after?.secondaryColor).toBe('#123456');
   expect(after?.whatsappNumber).toBe('5511999999999');
 });
 it('cria marca ausente uma só vez sem sobrescrever criação concorrente', async () => {
   const secondTenant = randomUUID();
   await client`insert into tenants (id,name,slug) values (${secondTenant},'test',${secondTenant})`;
   try {
     const repo = new ChatBrandRepository(secondTenant, db);
     expect(await repo.snapshot()).toBeNull();
     const results = await Promise.all([repo.updateIfVersion('absent',{primaryColor:'#000000'}),repo.updateIfVersion('absent',{primaryColor:'#ffffff'})]);
     expect(results.filter(Boolean)).toHaveLength(1);
   } finally { await client`delete from tenants where id=${secondTenant}`; }
 });
 it('recusa carregar versão alterada do criativo', async () => {
   const assetId = randomUUID();
   await client`insert into creative_assets (id,tenant_id,type,url) values (${assetId},${tenantId},'image','https://example.test/image.png')`;
   const repo = new StudioRepository(tenantId, db);
   const initial = await repo.getChatAssetSnapshot(assetId);
   expect(await repo.findAssetByIdAndVersion(assetId,initial!.version)).toBeTruthy();
   await client`update creative_assets set url='https://example.test/new.png' where id=${assetId}`;
   expect(await repo.findAssetByIdAndVersion(assetId,initial!.version)).toBeNull();
 });
 it('registra falha sanitizada da aprovação e impede reexecução', async () => {
   const id = randomUUID();
   await client`insert into chat_approvals (id,tenant_id,user_id,conversation_id,method,path,body,status,expires_at) values (${id},${tenantId},${userId},${conversationId},'POST','/api/planner/posts','{}'::jsonb,'executing',now() + interval '1 hour')`;
   const repo = new ChatApprovalRepository(tenantId, db);
   await repo.fail(id,userId);
   const rows=await client`select status,result from chat_approvals where id=${id}`;
   expect(rows[0].status).toBe('failed'); expect(rows[0].result.error).toContain('Verifique');
   expect(await repo.consume({...action,approvalId:id,body:{}})).toBe(false);
 });
 it('registra resultado desconhecido sanitizado e impede reexecução', async () => {
   const id=randomUUID();
   await client`insert into chat_approvals (id,tenant_id,user_id,conversation_id,method,path,body,status,expires_at) values (${id},${tenantId},${userId},${conversationId},'POST','/api/planner/posts','{}'::jsonb,'approved',now()+interval '1 hour')`;
   const repo=new ChatApprovalRepository(tenantId,db);
   expect(await repo.consume({...action,approvalId:id,body:{}})).toBe(true);
   expect((await client`select execution_started_at from chat_approvals where id=${id}`)[0].execution_started_at).toBeTruthy();
   await repo.unknown(id,userId);
   const rows=await client`select status,result from chat_approvals where id=${id}`;
   expect(rows[0].status).toBe('unknown');expect(rows[0].result.error).toContain('Verifique');
   expect(await repo.consume({...action,approvalId:id,body:{}})).toBe(false);
 });
 it('registra sucesso tardio após estado desconhecido preservando resultado real', async () => {
   const id=randomUUID();
   await client`insert into chat_approvals (id,tenant_id,user_id,conversation_id,method,path,body,status,expires_at) values (${id},${tenantId},${userId},${conversationId},'POST','/api/planner/posts','{}'::jsonb,'executing',now()+interval '1 hour')`;
   const repo=new ChatApprovalRepository(tenantId,db);
   await repo.unknown(id,userId);
   await client`update chat_approvals set result='{"id":"post-criado"}'::jsonb where id=${id}`;
   await repo.complete(id,userId);
   const rows=await client`select status,result from chat_approvals where id=${id}`;
   expect(rows[0].status).toBe('completed');expect(rows[0].result).toEqual({id:'post-criado'});
 });
 it('descarta mensagem indeterminada ao confirmar sucesso tardio e preserva estados terminais', async () => {
   const id=randomUUID();
   await client`insert into chat_approvals (id,tenant_id,user_id,conversation_id,method,path,body,status,expires_at) values (${id},${tenantId},${userId},${conversationId},'POST','/api/planner/posts','{}'::jsonb,'executing',now()+interval '1 hour')`;
   const repo=new ChatApprovalRepository(tenantId,db);await repo.unknown(id,userId);await repo.complete(id,userId);
   const [completed]=await client`select status,result from chat_approvals where id=${id}`;
   expect(completed.status).toBe('completed');expect(completed.result).toBeNull();
   await client`update chat_approvals set status='failed',result='{"error":"original"}'::jsonb where id=${id}`;
   await repo.complete(id,userId);const [failed]=await client`select status,result from chat_approvals where id=${id}`;
   expect(failed.status).toBe('failed');expect(failed.result).toEqual({error:'original'});
 });
 it('converge para sucesso se unknown competir com confirmação 2xx', async () => {
   const id=randomUUID();
   await client`insert into chat_approvals (id,tenant_id,user_id,conversation_id,method,path,body,status,expires_at) values (${id},${tenantId},${userId},${conversationId},'POST','/api/planner/posts','{}'::jsonb,'executing',now()+interval '1 hour')`;
   const repo=new ChatApprovalRepository(tenantId,db);await Promise.all([repo.unknown(id,userId),repo.complete(id,userId)]);
   const [row]=await client`select status,result from chat_approvals where id=${id}`;
   expect(row.status).toBe('completed');expect(row.result).toBeNull();
 });
 it('não cria job pago depois que aprovação expirou em resultado desconhecido', async () => {
   const id=randomUUID();
   await client`insert into chat_approvals (id,tenant_id,user_id,conversation_id,method,path,body,status,expires_at) values (${id},${tenantId},${userId},${conversationId},'POST','/api/studio/video/jobs','{}'::jsonb,'unknown',now()+interval '1 hour')`;
   const repo=new WorkflowJobRepository('',db);
   const result=await repo.createTenantJobIfUnderLimit({id,tenantId,workflow:'studio-video',status:'pending',lockKey:`studio-video:${id}`},2,new Date(0),undefined,id);
   expect(result).toBe('approval_inactive');
   expect(await client`select id from workflow_jobs where id=${id}`).toHaveLength(0);
 });
 it('permite apenas um worker reclamar o job de vídeo', async () => {
   const id=randomUUID();
   await client`insert into workflow_jobs (id,tenant_id,workflow,status,lock_key) values (${id},${tenantId},'studio-video','pending',${`lock:${id}`})`;
   const repo=new WorkflowJobRepository('',db);
   const claims=await Promise.all([repo.claimVideoJob(id),repo.claimVideoJob(id)]);
   expect(claims.filter(Boolean)).toHaveLength(1);
   expect((await client`select status from workflow_jobs where id=${id}`)[0].status).toBe('running');
 });
 it('não sobrescreve job reclamado ao disputar com falha de enfileiramento', async () => {
   const id=randomUUID();
   await client`insert into workflow_jobs (id,tenant_id,workflow,status,lock_key) values (${id},${tenantId},'studio-video','pending',${`lock:${id}`})`;
   const repo=new WorkflowJobRepository('',db);
   const [claimed,failed]=await Promise.all([repo.claimVideoJob(id),repo.markPendingVideoEnqueueFailed(id,tenantId)]);
   expect(Number(Boolean(claimed))+Number(failed)).toBe(1);
   const [row]=await client`select status from workflow_jobs where id=${id}`;
   expect(row.status).toBe(claimed?'running':'error');
 });
 it('contabiliza envio incerto na cota mensal sem contar falha anterior ao envio', async () => {
   const id1=randomUUID(),id2=randomUUID(),other=randomUUID();
   await client`insert into workflow_jobs (id,tenant_id,workflow,status,lock_key,metadata) values
     (${id1},${tenantId},'quota-test','error',${`lock:${id1}`},'{"billingUncertain":true}'::jsonb),
     (${id2},${tenantId},'quota-test','error',${`lock:${id2}`},'{}'::jsonb),
     (${other},${tenantId},'quota-test','error',${`lock:${other}`},'{"billingUncertain":true,"rootAssetId":"modification"}'::jsonb)`;
   const repo=new WorkflowJobRepository('',db);
   expect(await repo.countPeriodJobs(tenantId,'quota-test',new Date(0))).toBe(1);
 });
 it('serializa operações da mesma campanha entre instâncias', async () => {
   const first = new ChatMetaLockRepository(tenantId,db), second = new ChatMetaLockRepository(tenantId,db);
   const events:string[]=[];
   const operation = (label:string) => async () => {events.push(`${label}-start`);await new Promise(resolve=>setTimeout(resolve,30));events.push(`${label}-end`);};
   await Promise.all([first.withLock('campaign',operation('a')),second.withLock('campaign',operation('b'))]);
   expect([['a-start','a-end','b-start','b-end'],['b-start','b-end','a-start','a-end']]).toContainEqual(events);
 });
 it('atualiza perfil e negócio apenas com versões atuais do mesmo tenant', async () => {
   const repo = new ChatProfileRepository(tenantId,db);
   const first = await repo.snapshot(userId);
   expect(first).toBeTruthy();
   expect(await new ChatProfileRepository(randomUUID(),db).snapshot(userId)).toBeNull();
   const results = await Promise.all([
     repo.updateIfVersion(userId,first!.userVersion,first!.tenantVersion,{name:'Ana',businessContext:'Café'}),
     repo.updateIfVersion(userId,first!.userVersion,first!.tenantVersion,{name:'Bia',businessContext:'Loja'}),
   ]);
   expect(results.filter(Boolean)).toHaveLength(1);
   const final = await repo.snapshot(userId);
   expect([['Ana','Café'],['Bia','Loja']]).toContainEqual([final!.name,final!.businessContext]);
 });
 it('preserva perfil ao rejeitar nome de negócio já usado', async () => {
   const otherTenant=randomUUID();
   await client`insert into tenants (id,name,slug) values (${otherTenant},'Negócio existente',${otherTenant})`;
   try {
     const repo=new ChatProfileRepository(tenantId,db);const before=await repo.snapshot(userId);
     await expect(repo.updateIfVersion(userId,before!.userVersion,before!.tenantVersion,{name:'Não aplicar',tenantName:'Negócio existente'})).rejects.toMatchObject({statusCode:409,code:'SLUG_EXISTS'});
     const after=await repo.snapshot(userId); expect(after!.name).toBe(before!.name);
   } finally { await client`delete from tenants where id=${otherTenant}`; }
 });
 it('exige aprovação vinculada ao perfil antes da atualização', async () => {
   const repo=new ChatProfileRepository(tenantId,db), snapshot=await repo.snapshot(userId), approval=randomUUID();
   const body={userVersion:snapshot!.userVersion,tenantVersion:snapshot!.tenantVersion,businessContext:'Atualização aprovada'};
   await client`insert into chat_approvals (id,tenant_id,user_id,conversation_id,method,path,body,status,expires_at) values (${approval},${tenantId},${userId},${conversationId},'PATCH','/api/auth/me/chat-update',${JSON.stringify(body)}::jsonb,'approved',now() + interval '1 hour')`;
   const secret='test-secret-with-sufficient-entropy-1234567890';
   const token=createChatDelegation({tenantId,userId,email:'test@example.com',role:'member'},secret);
   const controller=new ChatProfileController(new ChatProfileService(()=>repo));
   const server=express();server.use(express.json());server.use(createDelegationGuard({secret,repository:id=>new ChatApprovalRepository(id,db)}));
   server.patch('/api/auth/me/chat-update',authMiddleware,tenantMiddleware,controller.update);
   server.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode || 500).json({code:err.code}));
   const send=()=>request(server).patch('/api/auth/me/chat-update').set('Authorization',`Bearer ${token}`).set('X-Chat-Approval-Id',approval).send(body);
   expect((await send()).status).toBe(200);expect((await send()).status).toBe(403);
   expect((await repo.snapshot(userId))!.businessContext).toBe('Atualização aprovada');
 });
});
