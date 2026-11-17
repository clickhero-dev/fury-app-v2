/*
Funcionalidade: impedir duplicação de geração de vídeo
Cenário: dois workers disputam o mesmo job
Dado um job persistido uma única vez
Quando dois workers tentam iniciá-lo
Então apenas quem obtém o claim pode enviar ao provedor
Cenário: queda durante envio ao provedor
Dado que o worker perdeu a execução durante o envio pago
Quando o job é marcado como falho
Então o resultado é tratado como desconhecido sem estornar cota de modificação
*/
import {describe,it,expect,vi} from 'vitest';
import {StudioVideoService} from '../services/studio/studio-video.service.js';
describe('recuperação segura de vídeo',()=>{
 it('não executa job sem claim exclusivo',async()=>{
  const jobRepo={claimVideoJob:vi.fn().mockResolvedValue(null),claimResumableVideoJob:vi.fn().mockResolvedValue(null)};
  const submit=vi.fn();const svc=new StudioVideoService({jobRepo:jobRepo as any,video:{submit} as any});
  await svc.processJob('job');expect(submit).not.toHaveBeenCalled();expect(jobRepo.claimVideoJob).toHaveBeenCalledWith('job',expect.any(String));
 });
 it('não devolve cota se não se sabe se envio pago ocorreu',async()=>{
  const jobRepo={getWorkflowJob:vi.fn().mockResolvedValue({status:'running',currentStage:'submitting',metadata:{rootAssetId:'root',openrouterJobId:null}}),markUnsubmittedVideoFailed:vi.fn().mockResolvedValue(undefined)};
  const quota={consume:vi.fn(),refund:vi.fn()};const svc=new StudioVideoService({jobRepo:jobRepo as any,modQuota:quota});
  await svc.markFailed('job','worker caiu');expect(quota.refund).not.toHaveBeenCalled();expect(jobRepo.markUnsubmittedVideoFailed).toHaveBeenCalledWith('job');
 });
 it('recupera apenas jobs pendentes usando os mesmos identificadores',async()=>{
  const jobRepo={reconcileVideoAdjustments:vi.fn().mockResolvedValue(0),listRecoverableWorkflowJobs:vi.fn().mockResolvedValue([{id:'pending',tenantId:'t1',status:'pending'},{id:'running',tenantId:'t1',status:'running'}])};
  const enqueue=vi.fn().mockResolvedValue(undefined);
  const svc=new StudioVideoService({jobRepo:jobRepo as any,enqueue});
  expect(await svc.recoverPendingJobs()).toBe(1);expect(enqueue).toHaveBeenCalledWith('pending','t1');expect(enqueue).toHaveBeenCalledTimes(1);
 });
 it('falha de um job não impede recuperação dos demais',async()=>{
  const jobRepo={reconcileVideoAdjustments:vi.fn().mockResolvedValue(0),listRecoverableWorkflowJobs:vi.fn().mockResolvedValue([{id:'first',tenantId:'t1',status:'pending'},{id:'second',tenantId:'t2',status:'pending'}])};
  const enqueue=vi.fn().mockRejectedValueOnce(Error('falha')).mockResolvedValue(undefined);
  const svc=new StudioVideoService({jobRepo:jobRepo as any,enqueue});
  expect(await svc.recoverPendingJobs()).toBe(1);expect(enqueue).toHaveBeenCalledTimes(2);
 });
 it('preserva job com identificador pago após falha da fila',async()=>{
  const jobRepo={getWorkflowJob:vi.fn().mockResolvedValue({status:'running',currentStage:'generating',metadata:{openrouterJobId:'paid'}}),patchWorkflowJob:vi.fn()};
  const svc=new StudioVideoService({jobRepo:jobRepo as any});
  await svc.markFailed('job','worker caiu');expect(jobRepo.patchWorkflowJob).not.toHaveBeenCalled();
 });
 it('enfileira somente jobs órfãos com identificador pago',async()=>{
  const jobRepo={reconcileVideoAdjustments:vi.fn().mockResolvedValue(0),listRecoverableWorkflowJobs:vi.fn().mockResolvedValue([{id:'paid',tenantId:'t',status:'running',updatedAt:new Date(0),metadata:{openrouterJobId:'provider'}},{id:'unknown',tenantId:'t',status:'running',updatedAt:new Date(0),metadata:{}}])};
  const enqueue=vi.fn();const svc=new StudioVideoService({jobRepo:jobRepo as any,enqueue});
  expect(await svc.recoverPendingJobs()).toBe(1);expect(enqueue).toHaveBeenCalledWith('paid','t');
 });
});
