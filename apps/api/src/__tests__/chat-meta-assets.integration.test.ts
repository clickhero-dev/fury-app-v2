/*
Funcionalidade: paginação dos ativos da Meta
Cenário: retornar todas as páginas de conjuntos
Dado que a Meta fornece duas páginas
Quando os conjuntos são listados
Então os ativos das duas páginas são retornados
Cenário: interromper paginação repetida
Dado que a Meta repete o cursor
Quando os conjuntos são listados
Então a API retorna falha ao invés de resultado incompleto
*/
import {describe,it,expect,vi,beforeEach} from 'vitest';
const {call} = vi.hoisted(() => ({call:vi.fn()}));
vi.mock('../lib/meta-api.js',async importOriginal => ({...await importOriginal(),metaApiCall:call}));
import {DefaultMetaCampaignProvider} from '../lib/providers/default-meta-campaign.provider.js';
describe('paginação de ativos Meta',()=>{
 beforeEach(()=>call.mockReset());
 it('agrega páginas usando cursor',async()=>{
  call.mockResolvedValueOnce({data:[{id:'1'}],paging:{next:'url',cursors:{after:'cursor'}}}).mockResolvedValueOnce({data:[{id:'2'}]});
  const provider=new DefaultMetaCampaignProvider();
  expect(await provider.listChatAdSets('123','token')).toEqual([{id:'1'},{id:'2'}]);
  expect(call.mock.calls[1][0]).toContain('after=cursor');
 });
 it('não aceita cursor repetido',async()=>{
  call.mockResolvedValue({data:[{id:'1'}],paging:{next:'url',cursors:{after:'cursor'}}});
  await expect(new DefaultMetaCampaignProvider().listChatAdSets('123','token')).rejects.toThrow('pagination');
 });
});
