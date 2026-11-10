/*
Funcionalidade: criar anúncio individual em campanha existente
Cenário: criar anúncio pausado com ativos autorizados
Dado um conjunto e um criativo da conta da campanha
Quando a criação é confirmada com snapshot atual
Então a Meta recebe criação pausada com esses ativos
Cenário: rejeitar ativo de outra campanha
Dado um conjunto de outra campanha
Quando o snapshot é consultado
Então o acesso é negado
Cenário: rejeitar mudanças após proposta
Dado um snapshot dos ativos
Quando o conjunto muda antes da confirmação
Então a criação é rejeitada
*/
import {describe,it,expect,vi} from 'vitest';
import {CampaignsService} from '../services/campaigns/campaigns.service.js';
function setup(){
 const repo={findCampaignById:vi.fn().mockResolvedValue({id:'c1',tenantId:'t1',metaCampaignId:'mc1'}),findMetaConnection:vi.fn().mockResolvedValue({accessToken:'secret'})};
 const meta={getCampaign:vi.fn().mockResolvedValue({id:'mc1',account_id:'100',name:'Campanha',status:'ACTIVE'}),getAdSet:vi.fn().mockResolvedValue({id:'200',campaign_id:'mc1',account_id:'100',name:'Conjunto',status:'ACTIVE'}),getAdCreative:vi.fn().mockResolvedValue({id:'300',account_id:'100',name:'Criativo'}),createAd:vi.fn().mockResolvedValue({id:'400'})};
 const svc=new CampaignsService(meta as any,repo as any,{decryptMetaToken:()=> 'token'} as any);return {svc,meta};
}
const base={tenantId:'t1',campaignId:'c1',adsetId:'200',creativeId:'300'};
describe('criar anúncio individual',()=>{
 it('cria pausado com ativos da campanha',async()=>{const {svc,meta}=setup();const snapshot=await svc.getChatAdCreationSnapshot(base);await svc.createChatAd({...base,version:snapshot.version,name:'Novo anúncio'});expect(meta.createAd).toHaveBeenCalledWith('act_100','token',{name:'Novo anúncio',adset_id:'200',creative:{creative_id:'300'},status:'PAUSED'});});
 it('nega conjunto de outra campanha',async()=>{const {svc,meta}=setup();meta.getAdSet.mockResolvedValueOnce({id:'200',campaign_id:'other',account_id:'100',name:'x',status:'ACTIVE'});await expect(svc.getChatAdCreationSnapshot(base)).rejects.toMatchObject({statusCode:403});});
 it('nega criativo de outra conta',async()=>{const {svc,meta}=setup();meta.getAdCreative.mockResolvedValueOnce({id:'300',account_id:'999',name:'Criativo'});await expect(svc.getChatAdCreationSnapshot(base)).rejects.toMatchObject({statusCode:403});expect(meta.createAd).not.toHaveBeenCalled();});
 it('recusa alteração após proposta',async()=>{const {svc,meta}=setup();const snapshot=await svc.getChatAdCreationSnapshot(base);meta.getAdSet.mockResolvedValueOnce({id:'200',campaign_id:'mc1',account_id:'100',name:'Mudou',status:'ACTIVE'});await expect(svc.createChatAd({...base,version:snapshot.version,name:'Novo anúncio'})).rejects.toMatchObject({statusCode:409});expect(meta.createAd).not.toHaveBeenCalled();});
 it('sanitiza indisponibilidade dos ativos Meta',async()=>{const {svc,meta}=setup();meta.getAdCreative.mockRejectedValueOnce(Error('segredo'));await expect(svc.getChatAdCreationSnapshot(base)).rejects.toMatchObject({statusCode:503,message:'Não foi possível consultar os ativos do anúncio.'});});
});
