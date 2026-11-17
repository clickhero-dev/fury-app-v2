/*
Funcionalidade: retomada segura de vídeo após queda
Cenário: uma posse expirada é substituída apenas com identificador do provedor
Cenário: o antigo dono não pode alterar o trabalho após nova posse
*/
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import * as schema from '@fury/db';
import { WorkflowJobRepository } from '../repository/workflow-job.repository.js';
const url = process.env.TEST_CHAT_DATABASE_URL;
describe.skipIf(!url)('fencing de vídeo no PostgreSQL', () => {
 const client = postgres(url!, { max: 4 });
 const db = drizzle(client, { schema }) as any;
 const tenant = randomUUID();
 beforeAll(async () => { await client`insert into tenants (id,name,slug) values (${tenant},'test',${tenant})`; });
 afterAll(async () => { await client`delete from tenants where id=${tenant}`; await client.end(); });
 it('troca posse expirada e impede escrita do antigo dono', async () => {
  const id=randomUUID(), old=randomUUID(), next=randomUUID();
  await client`insert into workflow_jobs (id,tenant_id,workflow,status,lock_key,current_stage,metadata,video_lease_token,updated_at) values (${id},${tenant},'studio-video','running',${id},'generating',${JSON.stringify({openrouterJobId:'provider-job'})}::jsonb,${old},now()-interval '11 minutes')`;
  const repo=new WorkflowJobRepository('',db);
  const claims=await Promise.all([repo.claimResumableVideoJob(id,next),repo.claimResumableVideoJob(id,randomUUID())]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const winner=claims.find(Boolean)!.videoLeaseToken!;
  const before=await repo.countPeriodJobs(tenant,'studio-video',new Date(0));
  expect(await repo.patchOwnedVideoJob(id,old,{currentStage:'saving'})).toBe(false);
  expect(await repo.markUnsubmittedVideoFailed(id)).toBeNull();
  expect(await repo.patchOwnedVideoJob(id,old,{status:'error'})).toBe(false);
  expect(await repo.completeOwnedVideoJob(id,old,{tenantId:tenant,type:'video',url:'https://example.invalid/video.mp4'},{})).toBeNull();
  expect(await repo.countPeriodJobs(tenant,'studio-video',new Date(0))).toBe(before);
  expect(await client`select id from creative_assets where id=${id}`).toHaveLength(0);
  expect(await repo.patchOwnedVideoJob(id,winner,{currentStage:'saving'})).toBe(true);
 });
 it('não recupera geração sem identificador do provedor', async () => {
  const id=randomUUID();
  await client`insert into workflow_jobs (id,tenant_id,workflow,status,lock_key,current_stage,metadata,updated_at) values (${id},${tenant},'studio-video','running',${id},'submitting','{}',now()-interval '11 minutes')`;
  expect(await new WorkflowJobRepository('',db).claimResumableVideoJob(id,randomUUID())).toBeNull();
 });
 it('conclui asset e trabalho juntos, sem duplicação e recusando dono antigo', async () => {
  const id=randomUUID(), token=randomUUID();
  await client`insert into workflow_jobs (id,tenant_id,workflow,status,lock_key,current_stage,metadata,video_lease_token) values (${id},${tenant},'studio-video','running',${id},'saving','{}',${token})`;
  const repo=new WorkflowJobRepository('',db);
  const asset={tenantId:tenant,type:'video',url:'https://example.invalid/video.mp4'} as any;
  expect(await repo.completeOwnedVideoJob(id,randomUUID(),asset,{})).toBeNull();
  const results=await Promise.all([repo.completeOwnedVideoJob(id,token,asset,{}),repo.completeOwnedVideoJob(id,token,asset,{})]);
  expect(results.filter(Boolean)).toHaveLength(1);
  const rows=await client`select id from creative_assets where id=${id} and tenant_id=${tenant}`;
  expect(rows).toHaveLength(1);
  const jobs=await client`select status,artifacts from workflow_jobs where id=${id}`;
  expect(jobs[0].status).toBe('done');
  expect(jobs[0].artifacts.assetId).toBe(id);
 });
 it('registra falha e estorna uma vez sob concorrência, respeitando posse', async () => {
  const id=randomUUID(), token=randomUUID(), root=randomUUID();
  await client`insert into creative_assets (id,tenant_id,type,url,modifications_remaining) values (${root},${tenant},'video','https://example.invalid/root.mp4',0)`;
  await client`insert into workflow_jobs (id,tenant_id,workflow,status,lock_key,metadata,video_lease_token) values (${id},${tenant},'studio-video','running',${id},${JSON.stringify({rootAssetId:root})}::jsonb,${token})`;
  const repo=new WorkflowJobRepository('',db);
  expect(await repo.failOwnedVideoJob(id,randomUUID(),'falha',{rootAssetId:root},true)).toBe(false);
  const results=await Promise.all([repo.failOwnedVideoJob(id,token,'falha',{rootAssetId:root},true),repo.failOwnedVideoJob(id,token,'falha',{rootAssetId:root},true)]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect((await client`select modifications_remaining from creative_assets where id=${root}`)[0].modifications_remaining).toBe(1);
  expect((await client`select status from workflow_jobs where id=${id}`)[0].status).toBe('error');
 });
 it('reverte falha quando raiz pertence a outro tenant', async () => {
  const id=randomUUID(), token=randomUUID(), root=randomUUID(), other=randomUUID();
  await client`insert into tenants (id,name,slug) values (${other},'other',${other})`;
  try {
   await client`insert into creative_assets (id,tenant_id,type,url,modifications_remaining) values (${root},${other},'video','https://example.invalid/root.mp4',0)`;
   await client`insert into workflow_jobs (id,tenant_id,workflow,status,lock_key,metadata,video_lease_token) values (${id},${tenant},'studio-video','running',${id},${JSON.stringify({rootAssetId:root})}::jsonb,${token})`;
   await expect(new WorkflowJobRepository('',db).failOwnedVideoJob(id,token,'falha',{rootAssetId:root},true)).rejects.toThrow();
   expect((await client`select status from workflow_jobs where id=${id}`)[0].status).toBe('running');
   expect((await client`select modifications_remaining from creative_assets where id=${root}`)[0].modifications_remaining).toBe(0);
  } finally { await client`delete from tenants where id=${other}`; }
 });
 it('não estorna quando cobrança é incerta', async () => {
  const id=randomUUID(),token=randomUUID(),root=randomUUID();
  await client`insert into creative_assets (id,tenant_id,type,url,modifications_remaining) values (${root},${tenant},'video','https://example.invalid/root.mp4',0)`;
  await client`insert into workflow_jobs (id,tenant_id,workflow,status,lock_key,metadata,video_lease_token) values (${id},${tenant},'studio-video','running',${id},${JSON.stringify({rootAssetId:root})}::jsonb,${token})`;
  expect(await new WorkflowJobRepository('',db).failOwnedVideoJob(id,token,'incerto',{rootAssetId:root,billingUncertain:true},false)).toBe(true);
  expect((await client`select modifications_remaining from creative_assets where id=${root}`)[0].modifications_remaining).toBe(0);
 });
 it('reserva cota e prepara job durável, conciliando queda antes do roteiro', async () => {
  const id=randomUUID(),root=randomUUID(),repo=new WorkflowJobRepository('',db);
  await client`insert into creative_assets (id,tenant_id,type,url,modifications_remaining) values (${root},${tenant},'video','https://example.invalid/root.mp4',1)`;
  expect(await repo.reserveVideoAdjustment({id,tenantId:tenant,rootAssetId:root},100)).toBe('created');
  expect((await client`select modifications_remaining from creative_assets where id=${root}`)[0].modifications_remaining).toBe(0);
  expect((await client`select status from workflow_jobs where id=${id}`)[0].status).toBe('awaiting_images');
  await client`update workflow_jobs set updated_at=now()-interval '11 minutes' where id=${id}`;
  expect(await repo.reconcileVideoAdjustments()).toBe(1);
  expect(await repo.reconcileVideoAdjustments()).toBe(0);
  expect((await client`select modifications_remaining from creative_assets where id=${root}`)[0].modifications_remaining).toBe(1);
  expect(await repo.activateVideoAdjustment(id,tenant,{})).toBe(false);
 });
 it('não reconcilia reserva ativada e não duplica consumo', async () => {
  const id=randomUUID(),root=randomUUID(),repo=new WorkflowJobRepository('',db);
  await client`insert into creative_assets (id,tenant_id,type,url,modifications_remaining) values (${root},${tenant},'video','https://example.invalid/root.mp4',2)`;
  expect(await repo.reserveVideoAdjustment({id,tenantId:tenant,rootAssetId:root},100)).toBe('created');
  expect(await repo.reserveVideoAdjustment({id,tenantId:tenant,rootAssetId:root},100)).toBe('exists');
  expect(await repo.activateVideoAdjustment(id,tenant,{rootAssetId:root})).toBe(true);
  await client`update workflow_jobs set updated_at=now()-interval '11 minutes' where id=${id}`;
  expect(await repo.reconcileVideoAdjustments()).toBe(0);
  expect((await client`select modifications_remaining from creative_assets where id=${root}`)[0].modifications_remaining).toBe(1);
  expect(await repo.cancelVideoAdjustment(id,tenant)).toBe(true);
  expect(await repo.cancelVideoAdjustment(id,tenant)).toBe(false);
  expect((await client`select modifications_remaining from creative_assets where id=${root}`)[0].modifications_remaining).toBe(2);
 });
 it('ativação e reconciliação concorrentes não estornam job enfileirável', async () => {
  const id=randomUUID(),root=randomUUID(),repo=new WorkflowJobRepository('',db);
  await client`insert into creative_assets (id,tenant_id,type,url,modifications_remaining) values (${root},${tenant},'video','https://example.invalid/root.mp4',1)`;
  await repo.reserveVideoAdjustment({id,tenantId:tenant,rootAssetId:root},100);
  await client`update workflow_jobs set updated_at=now()-interval '11 minutes' where id=${id}`;
  const [activated]=await Promise.all([repo.activateVideoAdjustment(id,tenant,{rootAssetId:root}),repo.cancelVideoAdjustment(id,tenant,true)]);
  const [job]=await client`select status from workflow_jobs where id=${id}`;
  const [asset]=await client`select modifications_remaining from creative_assets where id=${root}`;
  expect([job.status,asset.modifications_remaining]).toEqual(activated ? ['pending',0] : ['error',1]);
 });
 it('solicitações simultâneas do mesmo ajuste consomem uma única cota', async () => {
  const id=randomUUID(),root=randomUUID(),repo=new WorkflowJobRepository('',db);
  await client`insert into creative_assets (id,tenant_id,type,url,modifications_remaining) values (${root},${tenant},'video','https://example.invalid/root.mp4',2)`;
  const outcomes=await Promise.all([repo.reserveVideoAdjustment({id,tenantId:tenant,rootAssetId:root},100),repo.reserveVideoAdjustment({id,tenantId:tenant,rootAssetId:root},100)]);
  expect(outcomes.sort()).toEqual(['created','exists']);
  expect((await client`select modifications_remaining from creative_assets where id=${root}`)[0].modifications_remaining).toBe(1);
 });
 it('queda após claim e antes da submissão estorna a reserva com segurança', async () => {
  const id=randomUUID(),root=randomUUID(),repo=new WorkflowJobRepository('',db);
  await client`insert into creative_assets (id,tenant_id,type,url,modifications_remaining) values (${root},${tenant},'video','https://example.invalid/root.mp4',0)`;
  await client`insert into workflow_jobs (id,tenant_id,workflow,status,lock_key,current_stage,metadata) values (${id},${tenant},'studio-video','running',${id},'queued',${JSON.stringify({rootAssetId:root})}::jsonb)`;
  const results=await Promise.all([repo.markUnsubmittedVideoFailed(id),repo.markUnsubmittedVideoFailed(id)]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect((await client`select modifications_remaining from creative_assets where id=${root}`)[0].modifications_remaining).toBe(1);
  const [job]=await client`select status,metadata from workflow_jobs where id=${id}`;
  expect(job.status).toBe('error');expect(job.metadata.billingUncertain).toBeUndefined();
 });
});
