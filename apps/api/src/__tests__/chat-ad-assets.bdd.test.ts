/*
Funcionalidade: escolher ativos de anúncios existentes
Cenário: listar ativos da campanha
Dado anúncios pertencentes à campanha
Quando seus ativos são consultados
Então conjuntos e criativos são deduplicados
Cenário: falha parcial
Dado que uma consulta a anúncio falha
Quando os demais ativos são retornados
Então a resposta informa falha parcial sanitizada
*/
import {describe,it,expect,vi} from 'vitest';
import {CampaignsService} from '../services/campaigns/campaigns.service.js';
function setup(){
 const repo={findCampaignById:vi.fn().mockResolvedValue({id:'c1',tenantId:'t1',metaCampaignId:'mc1'}),findMetaConnection:vi.fn().mockResolvedValue({accessToken:'secret'})};
 const meta={getCampaignAds:vi.fn().mockResolvedValue([{id:'1'},{id:'2'}]),getAd:vi.fn().mockImplementation(async(id:string)=>({id,campaign_id:'mc1',adset_id:'set1',creative:{id:'creative1'}}))};
 return {svc:new CampaignsService(meta as any,repo as any,{decryptMetaToken:()=> 'token'} as any),meta};
}
describe('ativos de anúncios existentes',()=>{
 it('deduplica conjuntos e criativos',async()=>{const {svc}=setup();expect(await svc.getChatAdAssets({tenantId:'t1',campaignId:'c1'})).toEqual({data:{adsets:[{id:'set1'}],creatives:[{id:'creative1'}]},partial_failures:[]});});
 it('retorna falha parcial sanitizada',async()=>{const {svc,meta}=setup();meta.getAd.mockRejectedValueOnce(Error('secret'));const result=await svc.getChatAdAssets({tenantId:'t1',campaignId:'c1'});expect(result.data.adsets).toEqual([{id:'set1'}]);expect(result.partial_failures).toHaveLength(1);expect(JSON.stringify(result)).not.toContain('secret');});
});
