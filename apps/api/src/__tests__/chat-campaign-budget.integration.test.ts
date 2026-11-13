/*
Funcionalidade: orçamento aprovado na criação de campanha
Cenário: envio à Meta inclui orçamento diário em centavos e estratégia de lance
Cenário: rejeição da Meta não grava campanha local
Cenário: conta de outro tenant não envia requisição
*/
import {afterEach,describe,expect,it,vi} from 'vitest';
import {CampaignsService} from '../services/campaigns/campaigns.service.js';
import {DefaultMetaCampaignProvider} from '../lib/providers/default-meta-campaign.provider.js';
import {MockCampaignRepository} from '../lib/providers/mock-campaign.repository.js';
vi.mock('@fury/db',()=>({db:{query:{tenants:{findFirst:vi.fn()}}},tenants:{},eq:vi.fn()}));
const args={tenantId:'tenant',name:'Campanha',objective:'OUTCOME_SALES' as const,dailyBudget:1234,adAccountId:'act_123',enforceBrl:true};
function setup(account='act_123'){
 const repo=new MockCampaignRepository();
 repo.metaConnections.push({tenantId:'tenant',adAccounts:[{id:account}],accessToken:'token'} as any);
 const service=new CampaignsService(new DefaultMetaCampaignProvider(),repo,{decryptMetaToken:(s:string)=>s,upsertCampaignSnapshot:async()=>{}} as any);
 return {repo,service};
}
describe('orçamento da campanha na Graph API',()=>{
 afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
 it('envia o corpo exato do orçamento aprovado',async()=>{
  vi.stubEnv('META_API_MOCK','false');const fetch=vi.fn().mockResolvedValueOnce(new Response('{"currency":"BRL"}',{status:200})).mockResolvedValueOnce(new Response('{"id":"campaign-1"}',{status:200}));vi.stubGlobal('fetch',fetch);
  const {service,repo}=setup();await service.createCampaign(args);
  const [currencyUrl]=fetch.mock.calls[0];expect(new URL(currencyUrl).searchParams.get('fields')).toBe('currency');
  const [url,request]=fetch.mock.calls[1];expect(new URL(url).pathname).toBe('/v25.0/act_123/campaigns');
  expect(request.method).toBe('POST');expect(JSON.parse(request.body)).toEqual({name:'Campanha',objective:'OUTCOME_SALES',status:'PAUSED',special_ad_categories:[],is_adset_budget_sharing_enabled:false,daily_budget:1234,bid_strategy:'LOWEST_COST_WITHOUT_CAP'});
  expect(repo.campaigns[0].budget).toMatchObject({daily_budget:1234});
 });
 it('não cria registro após erro da Meta',async()=>{
  vi.stubEnv('META_API_MOCK','false');vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('{"currency":"BRL"}',{status:200})).mockResolvedValueOnce(new Response('{"error":{"code":100,"message":"invalid budget"}}',{status:400})));
  const {service,repo}=setup();await expect(service.createCampaign(args)).rejects.toThrow();expect(repo.campaigns).toHaveLength(0);
 });
 it.each(['USD',undefined])('bloqueia orçamento em reais quando moeda da conta é %s',async currency=>{
  vi.stubEnv('META_API_MOCK','false');const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({currency}),{status:200}));vi.stubGlobal('fetch',fetch);
  const {service,repo}=setup();await expect(service.createCampaign(args)).rejects.toMatchObject({statusCode:400,code:'META_ACCOUNT_CURRENCY_UNSUPPORTED'});
  expect(fetch).toHaveBeenCalledTimes(1);expect(repo.campaigns).toHaveLength(0);
 });
 it('não acessa Meta usando conta alheia',async()=>{
  vi.stubEnv('META_API_MOCK','false');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  const {service,repo}=setup('act_other');await expect(service.createCampaign(args)).rejects.toMatchObject({statusCode:403});expect(fetch).not.toHaveBeenCalled();expect(repo.campaigns).toHaveLength(0);
 });
 it('consulta moeda da conta autenticada e recusa outra conta antes de acessar Meta',async()=>{
  vi.stubEnv('META_API_MOCK','false');const fetch=vi.fn().mockResolvedValue(new Response('{"currency":"BRL"}',{status:200}));vi.stubGlobal('fetch',fetch);
  const {service}=setup();
  await expect(service.getChatAdAccount({tenantId:'tenant',adAccountId:'act_123'})).resolves.toEqual({id:'act_123',currency:'BRL'});
  await expect(service.getChatAdAccount({tenantId:'tenant',adAccountId:'act_999'})).rejects.toMatchObject({statusCode:403});
  expect(fetch).toHaveBeenCalledOnce();expect(new URL(fetch.mock.calls[0][0]).pathname).toBe('/v25.0/act_123');
 });
});
