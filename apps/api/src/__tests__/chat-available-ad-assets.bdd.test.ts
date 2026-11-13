/*
Funcionalidade: escolher conjuntos e criativos disponíveis
Cenário: consultar ativos da campanha e conta
Dado uma campanha pertencente ao tenant
Quando os ativos são consultados
Então a API retorna conjuntos da campanha e criativos da conta
Cenário: uma fonte falha
Dado que a consulta de conjuntos falha
Quando os criativos são retornados
Então a API informa falha parcial sanitizada
Cenário: ambas as fontes falham
Dado que Meta está indisponível
Quando os ativos são consultados
Então a API retorna erro seguro
*/
import {describe,it,expect,vi} from 'vitest';
import {CampaignsService} from '../services/campaigns/campaigns.service.js';
function setup(){
 const repo={findCampaignById:vi.fn().mockResolvedValue({id:'c1',tenantId:'t1',metaCampaignId:'mc1'}),findMetaConnection:vi.fn().mockResolvedValue({accessToken:'secret'})};
 const meta={getCampaign:vi.fn().mockResolvedValue({id:'mc1',account_id:'100'}),listChatAdSets:vi.fn().mockResolvedValue([{id:'200',name:'Conjunto'}]),listChatAdCreatives:vi.fn().mockResolvedValue([{id:'300',name:'Criativo'}])};
 return {svc:new CampaignsService(meta as any,repo as any,{decryptMetaToken:()=> 'token'} as any),meta};
}
describe('ativos disponíveis',()=>{
 it('lista conjuntos da campanha e criativos da conta',async()=>{const {svc,meta}=setup();const r=await svc.getChatAvailableAdAssets({tenantId:'t1',campaignId:'c1'});expect(r.data.adsets).toEqual([{id:'200',name:'Conjunto'}]);expect(r.data.creatives).toEqual([{id:'300',name:'Criativo'}]);expect(meta.listChatAdCreatives).toHaveBeenCalledWith('act_100','token');});
 it('informa falha parcial sem vazar erro',async()=>{const {svc,meta}=setup();meta.listChatAdSets.mockRejectedValue(Error('secret'));const r=await svc.getChatAvailableAdAssets({tenantId:'t1',campaignId:'c1'});expect(r.data.creatives).toHaveLength(1);expect(r.partial_failures).toHaveLength(1);expect(JSON.stringify(r)).not.toContain('secret');});
 it('retorna erro seguro em falha total',async()=>{const {svc,meta}=setup();meta.listChatAdSets.mockRejectedValue(Error('secret'));meta.listChatAdCreatives.mockRejectedValue(Error('secret'));await expect(svc.getChatAvailableAdAssets({tenantId:'t1',campaignId:'c1'})).rejects.toMatchObject({statusCode:503});});
 it('detecta credencial expirada',async()=>{const {svc,meta}=setup();meta.listChatAdSets.mockRejectedValue(Object.assign(Error('secret'),{metaCode:190}));await expect(svc.getChatAvailableAdAssets({tenantId:'t1',campaignId:'c1'})).rejects.toMatchObject({statusCode:401,code:'META_TOKEN_EXPIRED'});});
 it('retorna parcial em timeout de uma fonte',async()=>{const {svc,meta}=setup();meta.listChatAdSets.mockRejectedValue(Object.assign(Error('timeout'),{name:'TimeoutError'}));const result=await svc.getChatAvailableAdAssets({tenantId:'t1',campaignId:'c1'});expect(result.partial_failures).toHaveLength(1);expect(result.data.creatives).toHaveLength(1);});
});
