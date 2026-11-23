/*
Funcionalidade: ações em campanha Meta com confirmação
Cenário: pausar campanha sem alteração desde a proposta
Dado um snapshot da campanha
Quando o usuário confirma a pausa com o mesmo snapshot
Então a campanha é pausada
Cenário: recusar campanha alterada
Dado um snapshot da campanha
Quando a Meta informa dados diferentes antes da confirmação
Então a operação retorna conflito sem atualizar a campanha
Cenário: recusar campanha de outro tenant
Dado uma campanha de outro tenant
Quando o assistente tenta consultá-la
Então a consulta é negada
*/
import {describe,it,expect,vi} from 'vitest';
import {CampaignsService} from '../services/campaigns/campaigns.service.js';
function setup(tenant='t1') {
 const record={id:'c1',tenantId:tenant,metaCampaignId:'m1'};
 const repo={findCampaignById:vi.fn().mockResolvedValue(record),findMetaConnection:vi.fn().mockResolvedValue({accessToken:'secret'})};
 const meta={getCampaign:vi.fn().mockResolvedValue({id:'m1',account_id:'123',name:'Campanha',status:'ACTIVE',daily_budget:'1000',updated_time:'2026-01-01'}),getAdAccountCurrency:vi.fn().mockResolvedValue('BRL'),updateCampaign:vi.fn().mockResolvedValue(undefined)};
 const svc=new CampaignsService(meta as any,repo as any,{decryptMetaToken:()=> 'token'} as any);
 return {svc,meta};
}
describe('campanha Meta no chat',()=>{
 it('executa pausa quando snapshot não mudou',async()=>{
  const {svc}=setup();const snap=await svc.getChatCampaignSnapshot({tenantId:'t1',campaignId:'c1'});
  const pause=vi.spyOn(svc,'pauseCampaign').mockResolvedValue({campaignId:'c1',status:'PAUSED'});
  await svc.updateChatCampaign({tenantId:'t1',campaignId:'c1',version:snap.version,action:'pause'});
  expect(pause).toHaveBeenCalledOnce();
 });
 it('recusa quando dados externos mudam',async()=>{
  const {svc,meta}=setup();const snap=await svc.getChatCampaignSnapshot({tenantId:'t1',campaignId:'c1'});
  meta.getCampaign.mockResolvedValueOnce({id:'m1',name:'Outra',status:'ACTIVE'});
  const pause=vi.spyOn(svc,'pauseCampaign');
  await expect(svc.updateChatCampaign({tenantId:'t1',campaignId:'c1',version:snap.version,action:'pause'})).rejects.toMatchObject({statusCode:409});expect(pause).not.toHaveBeenCalled();
 });
 it('recusa acesso de outro tenant',async()=>{const {svc}=setup('t2');await expect(svc.getChatCampaignSnapshot({tenantId:'t1',campaignId:'c1'})).rejects.toMatchObject({statusCode:403});});
 it('informa moeda sem bloquear pausa para conta não-BRL',async()=>{
  const {svc,meta}=setup();meta.getAdAccountCurrency.mockResolvedValue('USD');
  const snap=await svc.getChatCampaignSnapshot({tenantId:'t1',campaignId:'c1'});expect(snap.currency).toBe('USD');
  const pause=vi.spyOn(svc,'pauseCampaign').mockResolvedValue({campaignId:'c1',status:'PAUSED'});
  await svc.updateChatCampaign({tenantId:'t1',campaignId:'c1',version:snap.version,action:'pause'});expect(pause).toHaveBeenCalledOnce();
 });
 it('informa moeda desconhecida quando consulta da Meta falha',async()=>{
  const {svc,meta}=setup();meta.getAdAccountCurrency.mockRejectedValueOnce(Error('indisponível'));
  expect((await svc.getChatCampaignSnapshot({tenantId:'t1',campaignId:'c1'})).currency).toBeNull();
 });
});
