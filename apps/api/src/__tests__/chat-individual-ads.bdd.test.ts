/*
Funcionalidade: ações em anúncios individuais da Meta
Cenário: pausar anúncio confirmado
Dado um anúncio pertencente à campanha do usuário
Quando ele confirma a pausa com versão atual
Então o anúncio é pausado
Cenário: duplicar anúncio
Dado um anúncio existente com criativo e conjunto válidos
Quando o usuário confirma a criação de uma cópia
Então um anúncio pausado é criado usando os mesmos ativos
Cenário: rejeitar versão alterada
Dado um anúncio alterado depois da proposta
Quando a ação é confirmada
Então a API retorna conflito sem chamar a Meta para escrever
Cenário: rejeitar anúncio de outra campanha
Dado um anúncio de outra campanha
Quando ele é consultado
Então o acesso é negado
*/
import {describe,it,expect,vi} from 'vitest';
import {CampaignsService} from '../services/campaigns/campaigns.service.js';
function setup() {
 const repo={findCampaignById:vi.fn().mockResolvedValue({id:'c1',tenantId:'t1',metaCampaignId:'mc1'}),findMetaConnection:vi.fn().mockResolvedValue({accessToken:'secret'})};
 const meta={getAd:vi.fn().mockResolvedValue({id:'ad1',campaign_id:'mc1',account_id:'acc1',adset_id:'set1',creative:{id:'creative1'},name:'Anúncio',status:'ACTIVE',updated_time:'1'}),getAdCreative:vi.fn().mockResolvedValue({id:'new-creative',account_id:'acc1',name:'Criativo novo'}),updateAd:vi.fn().mockResolvedValue(undefined),createAd:vi.fn().mockResolvedValue({id:'new'})};
 const svc=new CampaignsService(meta as any,repo as any,{decryptMetaToken:()=> 'token'} as any);return {svc,meta};
}
describe('anúncio individual',()=>{
 it('pausa anúncio após verificar versão',async()=>{const {svc,meta}=setup();const snapshot=await svc.getChatAdSnapshot({tenantId:'t1',campaignId:'c1',adId:'ad1'});await svc.updateChatAd({tenantId:'t1',campaignId:'c1',adId:'ad1',version:snapshot.version,action:'pause'});expect(meta.updateAd).toHaveBeenCalledWith('ad1','token',{status:'PAUSED'});});
 it('duplica anúncio em estado pausado',async()=>{const {svc,meta}=setup();const snapshot=await svc.getChatAdSnapshot({tenantId:'t1',campaignId:'c1',adId:'ad1'});await svc.updateChatAd({tenantId:'t1',campaignId:'c1',adId:'ad1',version:snapshot.version,action:'duplicate',name:'Cópia'});expect(meta.createAd).toHaveBeenCalledWith('act_acc1','token',{name:'Cópia',adset_id:'set1',creative:{creative_id:'creative1'},status:'PAUSED'});});
 it('recusa snapshot obsoleto',async()=>{const {svc,meta}=setup();const snapshot=await svc.getChatAdSnapshot({tenantId:'t1',campaignId:'c1',adId:'ad1'});meta.getAd.mockResolvedValueOnce({id:'ad1',campaign_id:'mc1',name:'Mudou'} as any);await expect(svc.updateChatAd({tenantId:'t1',campaignId:'c1',adId:'ad1',version:snapshot.version,action:'pause'})).rejects.toMatchObject({statusCode:409});expect(meta.updateAd).not.toHaveBeenCalled();});
 it('nega ad de outra campanha',async()=>{const {svc,meta}=setup();meta.getAd.mockResolvedValueOnce({id:'ad1',campaign_id:'outra'} as any);await expect(svc.getChatAdSnapshot({tenantId:'t1',campaignId:'c1',adId:'ad1'})).rejects.toMatchObject({statusCode:403});});
 it('troca criativo da conta somente com versão do anúncio e criativo conferidos',async()=>{const {svc,meta}=setup();const args={tenantId:'t1',campaignId:'c1',adId:'ad1',creativeId:'new-creative'};const snapshot=await svc.getChatAdSnapshot(args);await svc.updateChatAd({...args,version:snapshot.version,action:'creative'});expect(meta.updateAd).toHaveBeenCalledWith('ad1','token',{creative:{creative_id:'new-creative'}});});
 it('rejeita criativo de outra conta',async()=>{const {svc,meta}=setup();meta.getAdCreative.mockResolvedValueOnce({id:'new-creative',account_id:'other',name:'Outro'});await expect(svc.getChatAdSnapshot({tenantId:'t1',campaignId:'c1',adId:'ad1',creativeId:'new-creative'})).rejects.toMatchObject({statusCode:403});});
});
