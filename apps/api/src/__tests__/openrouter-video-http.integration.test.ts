/*
Funcionalidade: integração de vídeo OpenRouter segura
Cenário: enviar, consultar e baixar vídeo
Dado um provedor disponível
Quando o serviço usa as três operações
Então recebe id, estado e conteúdo com timeout
Cenário: credencial expirada
Dado que o provedor retorna 401 e conteúdo sensível
Quando o envio falha
Então o erro e os logs são sanitizados
Cenário: timeout de envio
Dado que o provedor não responde
Quando o timeout expira
Então o chamador recebe erro de timeout sanitizado
Cenário: falha total de consulta ou download
Dado que o provedor retorna erro
Quando status ou conteúdo são consultados
Então os erros não expõem o payload do provedor
*/
import {describe,it,expect,vi,afterEach} from 'vitest';
const {event, resolveKey} = vi.hoisted(()=>({event:vi.fn(),resolveKey:vi.fn().mockResolvedValue({key:'token-secreto'})}));
vi.mock('../lib/ai-key-context.js',()=>({resolveAiKey:resolveKey}));
vi.mock('../lib/analytics.js',()=>({captureServerEvent:event}));
import {openrouterVideoClient} from '../lib/openrouter-video.js';
const input={model:'model',prompt:'prompt privado',duration:15,aspect_ratio:'9:16' as const,resolution:'720p',generate_audio:true,referenceImageUrls:[]};
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();event.mockClear();});
describe('HTTP OpenRouter vídeo',()=>{
 it('envia, consulta e baixa com sinal de timeout',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({id:'job'}))).mockResolvedValueOnce(new Response(JSON.stringify({status:'completed',usage:{cost:0.1},unsigned_urls:[]}))).mockResolvedValueOnce(new Response('video'));
  vi.stubGlobal('fetch',fetcher);expect(await openrouterVideoClient.submit(input)).toBe('job');expect((await openrouterVideoClient.getJob('job')).status).toBe('completed');expect((await openrouterVideoClient.download('job')).toString()).toBe('video');
  for(const [,options] of fetcher.mock.calls) expect(options.signal).toBeInstanceOf(AbortSignal);
 });
 it('não registra token ou payload do provedor em credencial expirada',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('token-secreto payload-privado',{status:401})));
  const errorLog=vi.spyOn(console,'error').mockImplementation(()=>{}),warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  await expect(openrouterVideoClient.submit(input)).rejects.toMatchObject({statusCode:502,code:'OPENROUTER_VIDEO_SUBMIT_ERROR'});
  expect(JSON.stringify([...errorLog.mock.calls,...warn.mock.calls,event.mock.calls])).not.toMatch(/token-secreto|payload-privado|prompt privado/);
 });
 it('classifica timeout sem expor erro original',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new DOMException('segredo','TimeoutError')));
  await expect(openrouterVideoClient.submit(input)).rejects.toMatchObject({code:'TIMEOUT'});
 });
 it('sanitiza erros de status e download',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('payload-privado',{status:500})));
  const errorLog=vi.spyOn(console,'error').mockImplementation(()=>{}),warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  await expect(openrouterVideoClient.getJob('job')).rejects.toMatchObject({statusCode:502});await expect(openrouterVideoClient.download('job')).rejects.toMatchObject({statusCode:502});
  expect(JSON.stringify([...errorLog.mock.calls,...warn.mock.calls,event.mock.calls])).not.toContain('payload-privado');
 });
 it('não propaga payload privado no estado de falha do provedor',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({status:'failed',error:'payload-privado token-secreto'}))));
  const state=await openrouterVideoClient.getJob('job');expect(JSON.stringify(state)).not.toMatch(/payload-privado|token-secreto/);
 });
 it('não propaga status arbitrário do provedor',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({status:'token-secreto'}))));
  expect((await openrouterVideoClient.getJob('job')).status).toBe('unknown');
 });
 it('recusa id de job inválido sem expor resposta',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({id:{secret:'token-secreto'}}))));
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  await expect(openrouterVideoClient.submit(input)).rejects.toMatchObject({statusCode:502,code:'OPENROUTER_VIDEO_SUBMIT_ERROR'});
  expect(JSON.stringify([...warn.mock.calls,event.mock.calls])).not.toContain('token-secreto');
 });
 it('reconhece moderação sem propagar mensagem do provedor',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({status:'failed',error:'safety payload-privado'}))));
  const state=await openrouterVideoClient.getJob('job');expect(state.error).toBe('content policy');expect(JSON.stringify(state)).not.toContain('payload-privado');
 });
 it('oculta corpo inválido retornado no envio',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('payload-privado')));
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  await expect(openrouterVideoClient.submit(input)).rejects.toMatchObject({statusCode:502});
  expect(JSON.stringify([...warn.mock.calls,event.mock.calls])).not.toContain('payload-privado');
 });
 it('marca chave indisponível como falha anterior ao envio',async()=>{
  resolveKey.mockRejectedValueOnce(Error('detalhe sensível'));
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  await expect(openrouterVideoClient.submit(input)).rejects.toMatchObject({code:'OPENROUTER_VIDEO_KEY_UNAVAILABLE',details:{notSubmitted:true}});
  expect(fetcher).not.toHaveBeenCalled();
 });
});
