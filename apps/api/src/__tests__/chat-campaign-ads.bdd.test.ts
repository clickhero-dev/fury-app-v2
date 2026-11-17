/*
Funcionalidade: consultar anúncios individuais por campanha
Cenário: listar anúncios da campanha pertencente ao tenant
Dado uma campanha do usuário e conexão Meta
Quando o assistente consulta seus anúncios
Então recebe identificadores e nomes dos anúncios
Cenário: negar campanha de outro tenant
Dado uma campanha de outro tenant
Quando o assistente solicita os anúncios
Então o acesso é negado e a Meta não é chamada
Cenário: falha da Meta
Dado uma falha na consulta da Meta
Quando os anúncios são solicitados
Então a API responde erro sanitizado
*/
import {describe,it,expect,vi} from 'vitest';
import {CampaignsService} from '../services/campaigns/campaigns.service.js';
const campaign = {id:'c1',tenantId:'t1',metaCampaignId:'m1'};
function setup(tenant='t1') {
 const meta = {getCampaignAds:vi.fn().mockResolvedValue([{id:'ad1',name:'Anúncio'}])};
 const repo = {findCampaignById:vi.fn().mockResolvedValue({...campaign,tenantId:tenant}),findMetaConnection:vi.fn().mockResolvedValue({accessToken:'secret'})};
 const service = new CampaignsService(meta as any,repo as any,{decryptMetaToken:()=> 'token'} as any);
 return {service,meta};
}
describe('consultar anúncios da campanha',()=>{
 it('lista anúncios após verificar posse',async()=>{const {service,meta}=setup();expect(await service.getChatCampaignAds({tenantId:'t1',campaignId:'c1'})).toEqual({data:[{id:'ad1',name:'Anúncio'}],partial_failures:[]});expect(meta.getCampaignAds).toHaveBeenCalledWith('m1','token');});
 it('nega campanha de outro tenant',async()=>{const {service,meta}=setup('t2');await expect(service.getChatCampaignAds({tenantId:'t1',campaignId:'c1'})).rejects.toMatchObject({statusCode:403});expect(meta.getCampaignAds).not.toHaveBeenCalled();});
 it('sanitiza falhas Meta',async()=>{const {service,meta}=setup();meta.getCampaignAds.mockRejectedValue(Error('token secreto'));await expect(service.getChatCampaignAds({tenantId:'t1',campaignId:'c1'})).rejects.toMatchObject({statusCode:503,message:'Não foi possível consultar os anúncios.'});});
 it('identifica token Meta expirado sem expor detalhes',async()=>{const {service,meta}=setup();meta.getCampaignAds.mockRejectedValue(Object.assign(Error('token secreto'),{metaCode:190}));await expect(service.getChatCampaignAds({tenantId:'t1',campaignId:'c1'})).rejects.toMatchObject({statusCode:401,code:'META_TOKEN_EXPIRED'});});
});
