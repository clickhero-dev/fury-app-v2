/*
Funcionalidade: ajustar vídeo do chat com versão aprovada
Cenário: usar a versão aprovada
Dado um vídeo existente na versão exibida
Quando o usuário confirma o ajuste
Então o serviço usa essa versão para iniciar o job
Cenário: rejeitar versão alterada
Dado um vídeo alterado após a proposta
Quando a versão antiga é usada
Então nenhum ajuste é iniciado
*/
import {describe,it,expect,vi} from 'vitest';
import {StudioVideoService} from '../services/studio/studio-video.service.js';
const asset={id:'asset',type:'video',rootAssetId:null};
describe('ajuste de vídeo com versão',()=>{
 it('encaminha a versão verificada ao fluxo existente',async()=>{
  const find=vi.fn().mockResolvedValue(asset);
  const svc=new StudioVideoService({studioRepo:()=>({findAssetByIdAndVersion:find} as any)});
  const adjust=vi.spyOn(svc,'adjustVideo').mockResolvedValue({jobId:'job'});
  await expect(svc.adjustChatVideo('tenant','asset','10','mude o fundo','user','approval-id')).resolves.toEqual({jobId:'job'});
  expect(find).toHaveBeenCalledWith('asset','10'); expect(adjust).toHaveBeenCalledWith('tenant','asset','mude o fundo','user',asset,'approval-id');
 });
 it('rejeita versão alterada sem chamar ajuste',async()=>{
  const svc=new StudioVideoService({studioRepo:()=>({findAssetByIdAndVersion:vi.fn().mockResolvedValue(null)} as any)});
  const adjust=vi.spyOn(svc,'adjustVideo');
  await expect(svc.adjustChatVideo('tenant','asset','10','mude o fundo','user','approval-id')).rejects.toMatchObject({statusCode:409});
  expect(adjust).not.toHaveBeenCalled();
 });
 it('reusa o identificador da aprovação no job persistido',async()=>{
  const video={...asset,complianceNotes:JSON.stringify({source:'openrouter-video',scenes:[{start:0,end:15,visual:'café',narration:''}],photos:[],durationSeconds:15})};
  const reserve=vi.fn().mockResolvedValue('created');
  const svc=new StudioVideoService({jobRepo:{reserveVideoAdjustment:reserve} as any,studioRepo:()=>({findAssetByIdAndVersion:vi.fn().mockResolvedValue(video)} as any),limits:async()=>({videosPerMonth:1,modificationsPerVideo:1,periodStart:new Date()})});
  vi.spyOn(svc as any,'askScript').mockResolvedValue({scenes:[],costUsd:0});
  const enqueue=vi.spyOn(svc as any,'enqueueJob').mockResolvedValue({jobId:'approval-id'});
  expect(await svc.adjustChatVideo('tenant','asset','10','mude o fundo','user','approval-id')).toEqual({jobId:'approval-id'});
  expect(reserve).toHaveBeenCalledWith({id:'approval-id',tenantId:'tenant',rootAssetId:'asset',approvalId:'approval-id'},2);
  expect(enqueue).toHaveBeenCalledWith('tenant',expect.any(Object),undefined,'approval-id','approval-id');
 });
 it('reusa identificador de aprovação para criação de vídeo',async()=>{
  const svc=new StudioVideoService({limits:async()=>({videosPerMonth:1,modificationsPerVideo:1,periodStart:new Date()}),photoRepo:()=>({findByIds:vi.fn().mockResolvedValue([])} as any)});
  const enqueue=vi.spyOn(svc as any,'enqueueJob').mockResolvedValue({jobId:'approval-id'});
  await svc.createJob('tenant',{prompt:'um vídeo de café',scenes:[],photoIds:[],duration:15,aspectRatio:'9:16'},'user','approval-id');
  expect(enqueue).toHaveBeenCalledWith('tenant',expect.any(Object),expect.any(Object),'approval-id');
 });
});
