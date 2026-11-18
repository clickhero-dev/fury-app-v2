import { describe, expect, it, vi } from 'vitest';
import { confirmBatch, reviewBatch } from './chat-batch';
import { chatRequest } from './chat-request';

vi.mock('./chat-request', () => ({ chatRequest: vi.fn() }));
const response = {
  reviewToken: '12345678-1234-4234-8234-123456789012', version: 1, digest: 'a'.repeat(64),
  approvalIds: ['a', 'b'], expiresAt: '2099-01-01T00:00:00Z',
  items: [
    { id: 'a', method: 'POST', path: '/api/studio/ai/generate-image', parameters: { prompt: 'Café', token: 'private' }, expiresAt: '2099-01-01T00:00:00Z', cost: { known: false, value: null }, quota: { known: true, value: '1 crédito' } },
    { id: 'b', method: 'POST', path: '/api/planner/posts', parameters: { caption: 'Olá' }, expiresAt: '2099-01-01T00:00:00Z', cost: { known: false, value: null }, quota: { known: false, value: null } },
  ],
};
describe('Adapter de revisão em lote', () => {
  it('preserva exatamente campos de confirmação e não exibe parâmetros privados nem inventa custo', async () => {
    vi.mocked(chatRequest).mockResolvedValueOnce(new Response(JSON.stringify(response)));
    const review = await reviewBatch('conv', ['a', 'b']);
    expect(review.items[0].title).toBe('Criar imagem');
    expect(review.items[0].details).toContain('Café');
    expect(review.items[0].details).not.toContain('private');
    expect(review.items[1].quota).toContain('não informado');
    vi.mocked(chatRequest).mockResolvedValueOnce(new Response(JSON.stringify({items:[{id:'a',status:'completed',result:{imageUrl:'https://example.test/image.png',secret:'private'}},{id:'b',status:'unknown',result:{error:'private db password'}}],partialFailure:true})));
    const result = await confirmBatch('conv', review);
    expect(JSON.parse(vi.mocked(chatRequest).mock.calls.at(-1)![1]!.body as string)).toEqual({
      approvalIds: ['a', 'b'], reviewToken: response.reviewToken, version: 1, digest: response.digest,
    });
    expect(result[1].message).not.toContain('private');
    expect(result[1].status).toBe('uncertain');
    expect(result[0].evidence).toEqual({imageUrl:'https://example.test/image.png'});
    expect(result[1].evidence).toEqual({});
  });
  it('rejeita snapshot de escopo diferente e ações desconhecidas', async () => {
    vi.mocked(chatRequest).mockResolvedValueOnce(new Response(JSON.stringify({...response,approvalIds:['foreign']})));
    await expect(reviewBatch('conv', ['a','b'])).rejects.toThrow();
    vi.mocked(chatRequest).mockResolvedValueOnce(new Response(JSON.stringify({...response,items:[{...response.items[0],path:'/admin/secret'},response.items[1]]})));
    await expect(reviewBatch('conv', ['a','b'])).rejects.toThrow();
  });
  it('não confirma revisão expirada nem aceita resultado estranho', async () => {
    vi.mocked(chatRequest).mockResolvedValueOnce(new Response(JSON.stringify({...response,expiresAt:'2000-01-01T00:00:00Z'})));
    await expect(reviewBatch('conv', ['a','b'])).rejects.toThrow();
    vi.mocked(chatRequest).mockResolvedValueOnce(new Response(JSON.stringify(response)));
    const review = await reviewBatch('conv', ['a','b']);
    vi.mocked(chatRequest).mockResolvedValueOnce(new Response(JSON.stringify({items:[{id:'a',status:'invented'}]})));
    await expect(confirmBatch('conv',review)).rejects.toThrow();
  });
  it.each([['image','imagem'],['video','vídeo']])('explica consumo %s sem inventar saldo ou moeda',async(unit,label)=>{
    vi.mocked(chatRequest).mockResolvedValueOnce(new Response(JSON.stringify({...response,items:[{...response.items[0],quota:{known:true,value:{unit,amount:1}}},response.items[1]]})));
    const review=await reviewBatch('conv',['a','b']);
    expect(review.items[0].quota).toContain(`Consome 1 ${label}`);
    expect(review.items[0].quota).not.toContain('saldo');
  });
  it('adapta prévia, orçamento e detalhes avançados sem modificar a confirmação assinada',async()=>{
    const parameters={currency:'BRL',dailyBudget:1000,objective:'OUTCOME_TRAFFIC',model:'technical-model',imageUrl:'https://example.test/proposta.png',videoUrl:'http://unsafe.test/private'};
    vi.mocked(chatRequest).mockResolvedValueOnce(new Response(JSON.stringify({...response,items:[{...response.items[0],parameters},response.items[1]]})));
    const review=await reviewBatch('conv',['a','b']);
    expect(review.items[0].details).toMatch(/R\$\s?10,00 por dia/);
    expect(review.items[0].details).not.toContain('technical-model');
    expect(review.items[0].advancedDetails).toContain('technical-model');
    expect(review.items[0].media).toEqual([{kind:'image',url:parameters.imageUrl}]);
    expect(JSON.parse(review.token)).toEqual({approvalIds:response.approvalIds,reviewToken:response.reviewToken,version:1,digest:response.digest,expiresAt:response.expiresAt,conversationId:'conv'});
  });
});
