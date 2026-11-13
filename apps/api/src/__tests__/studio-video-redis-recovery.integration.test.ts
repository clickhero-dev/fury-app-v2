/*
Funcionalidade: recuperar jobs de vídeo sem duplicar cobrança
Cenário: processo cai após persistir job e antes de enfileirar
Dado um workflow de vídeo pendente no PostgreSQL e fila Redis vazia
Quando o worker reinicia e recupera pendentes
Então ele envia a geração uma única vez
Cenário: resultado do envio pago é desconhecido
Dado que o provedor responde com timeout ao enviar
Quando o worker encerra o job
Então não há reenvio automático e o resultado exige conferência
*/
import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import * as schema from '@fury/db';
import {randomUUID} from 'node:crypto';
import {WorkflowJobRepository} from '../repository/workflow-job.repository.js';
import {StudioRepository} from '../repository/studio.repository.js';
import {StudioVideoService} from '../services/studio/studio-video.service.js';
import {startStudioVideoWorker,stopStudioVideoWorker,enqueueStudioVideo} from '../workers/studio-video.worker.js';
import {closeRedis} from '../lib/redis.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {isSafeChatTestRedis} from './helpers/chat-test-redis.js';
const url=process.env.TEST_CHAT_DATABASE_URL, redis=process.env.TEST_CHAT_REDIS_URL;
if (redis && !isSafeChatTestRedis(redis,process.env.REDIS_URL)) {
 throw new Error('Teste Redis exige TEST_CHAT_REDIS_URL e REDIS_URL idênticas, locais e no banco 15.');
}
describe.skipIf(!url || !redis)('recuperação Redis e PostgreSQL isolados',()=>{
 const sql=postgres(url!,{max:5}), db=drizzle(sql,{schema}) as any, tenant=randomUUID();
 const repo=new WorkflowJobRepository('',db);
 const video={submit:vi.fn().mockResolvedValue('provider-1'),getJob:vi.fn().mockResolvedValue({status:'completed',costUsd:0}),download:vi.fn().mockResolvedValue(Buffer.from('video'))};
 const common={jobRepo:repo,video:video as any,llm:{assertCreditsAvailable:vi.fn().mockResolvedValue(undefined)} as any,photoRepo:()=>({findByIds:async()=>[]}) as any,studioRepo:()=>({createAsset:async()=>({id:randomUUID()})}) as any,brand:async()=>({businessName:'Teste'}),limits:async()=>({videosPerMonth:null,modificationsPerVideo:null,periodStart:new Date(0)}),store:async()=> 'https://example.test/video.mp4',sleep:async()=>{}};
 const input={prompt:'Um vídeo de café',scenes:[{start:0,end:15,visual:'Café servido',narration:''}],photoIds:[],duration:15,aspectRatio:'9:16' as const};
 async function waitDone(id:string){for(let i=0;i<100;i++){const job=await repo.getWorkflowJob(id);if(job?.status==='done'||job?.status==='error')return job;await new Promise(r=>setTimeout(r,50));}throw new Error('timeout aguardando job');}
 beforeAll(async()=>{await sql`insert into tenants (id,name,slug) values (${tenant},'Teste',${tenant})`;});
 afterAll(async()=>{await stopStudioVideoWorker();await closeRedis();await sql`delete from tenants where id=${tenant}`;await sql.end();});
 it('recupera job persistido sem duplicar submit',async()=>{
  const beforeCrash=new StudioVideoService({...common,enqueue:async()=>{}});
  const {jobId}=await beforeCrash.createJob(tenant,input);
  expect((await repo.getWorkflowJob(jobId))?.status).toBe('pending');
  const afterRestart=new StudioVideoService({...common,enqueue:enqueueStudioVideo});
  await startStudioVideoWorker(afterRestart,{recoveryIntervalMs:100});
  expect((await waitDone(jobId))?.status).toBe('done');expect(video.submit).toHaveBeenCalledTimes(1);
 });
 it('não repete envio com resultado incerto',async()=>{
  video.submit.mockRejectedValueOnce(Error('timeout'));
  const svc=new StudioVideoService({...common,enqueue:enqueueStudioVideo});
  const {jobId}=await svc.createJob(tenant,input);
  const job=await waitDone(jobId);expect(job?.status).toBe('error');expect(job?.error).toContain('Verifique');
  expect((job?.metadata as any).billingUncertain).toBe(true);
  expect(await repo.countPeriodJobs(tenant,'studio-video',new Date(0))).toBe(2);
  await new Promise(r=>setTimeout(r,200));expect(video.submit).toHaveBeenCalledTimes(2);
 });
 it('preserva job já reclamado quando resposta do Redis se perde',async()=>{
  const enqueue=async(id:string,tenantId:string)=>{
    await enqueueStudioVideo(id,tenantId);
    for(let i=0;i<100;i++){const job=await repo.getWorkflowJob(id);if(job?.status!=='pending')break;await new Promise(r=>setTimeout(r,10));}
    throw new Error('resposta do Redis perdida');
  };
  const svc=new StudioVideoService({...common,enqueue});
  const {jobId}=await svc.createJob(tenant,input);
  expect((await waitDone(jobId))?.status).toBe('done');expect(video.submit).toHaveBeenCalledTimes(3);
 });
 it('retoma polling após queda sem novo submit pago',async()=>{
  const svc=new StudioVideoService({...common,enqueue:async()=>{}});
  const {jobId}=await svc.createJob(tenant,input);
  await sql`update workflow_jobs set status='running',current_stage='generating',metadata=metadata || '{"openrouterJobId":"provider-before-crash"}'::jsonb,updated_at=now()-interval '11 minutes' where id=${jobId}`;
  const before=video.submit.mock.calls.length;
  const resumed=new StudioVideoService({...common,enqueue:enqueueStudioVideo});
  await resumed.recoverPendingJobs();
  const result=await waitDone(jobId);
  expect(result?.status).toBe('done');
  expect(video.submit).toHaveBeenCalledTimes(before);
  expect(video.getJob).toHaveBeenCalledWith('provider-before-crash');
  expect((await sql`select id from creative_assets where id=${jobId} and tenant_id=${tenant}`)).toHaveLength(1);
 });
 it('reserva ajuste no PostgreSQL e conclui pela fila sem devolver a cota',async()=>{
  const root=randomUUID();
  const notes={source:'openrouter-video',prompt:'Café',scenes:input.scenes,photos:[],durationSeconds:15,aspectRatio:'9:16'};
  await sql`insert into creative_assets (id,tenant_id,type,url,modifications_remaining,compliance_notes) values (${root},${tenant},'video','https://example.test/original.mp4',1,${JSON.stringify(notes)})`;
  const service=new StudioVideoService({...common,studioRepo:()=>new StudioRepository(tenant,db),llm:{...common.llm,chatWithImages:vi.fn().mockResolvedValue({content:JSON.stringify({scenes:input.scenes}),costUsd:0})} as any,enqueue:enqueueStudioVideo});
  const {jobId}=await service.adjustVideo(tenant,root,'mude o fundo');
  expect((await waitDone(jobId))?.status).toBe('done');
  const [asset]=await sql`select modifications_remaining,active_asset_id from creative_assets where id=${root}`;
  expect(asset.modifications_remaining).toBe(0);expect(asset.active_asset_id).toBe(jobId);
 });
 it.skipIf(!['fury-chat-recovery-outage-test','fury-video-adr4-redis'].includes(process.env.TEST_CHAT_REDIS_CONTAINER ?? ''))('recupera pendente quando Redis volta após indisponibilidade',async()=>{
  const docker=promisify(execFile), container=process.env.TEST_CHAT_REDIS_CONTAINER!;
  const {stdout}=await docker('docker',['port',container,'6379/tcp']);
  const expectedPort=new URL(redis!).port;
  expect(stdout.trim()).toBe(`127.0.0.1:${expectedPort}`);
  await stopStudioVideoWorker();await closeRedis();video.submit.mockClear();
  const beforeCrash=new StudioVideoService({...common,enqueue:async()=>{}});
  const {jobId}=await beforeCrash.createJob(tenant,input);
  await docker('docker',['pause',container]);
  try {
    const afterRestart=new StudioVideoService({...common,enqueue:enqueueStudioVideo});
    await startStudioVideoWorker(afterRestart,{recoveryIntervalMs:100});
    await new Promise(r=>setTimeout(r,250));
  } finally { await docker('docker',['unpause',container]); }
  expect((await waitDone(jobId))?.status).toBe('done');expect(video.submit).toHaveBeenCalledTimes(1);
 });
});
