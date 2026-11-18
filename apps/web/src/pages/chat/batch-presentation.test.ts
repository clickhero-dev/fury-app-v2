import { describe, expect, it } from 'vitest';
import { batchDetails, batchAdvancedDetails, batchMedia } from './batch-presentation';

describe('Revisão financeira e escopo em linguagem simples', () => {
  it('mostra BRL por dia somente com moeda confirmada, também pelos valores atuais', () => {
    expect(batchDetails({dailyBudget:1000,currency:'BRL'})).toMatch(/R\$\s?10,00 por dia/);
    expect(batchDetails({atual:{currency:'BRL',dailyBudget:1000},alterações:{dailyBudget:2000}})).toMatch(/R\$\s?20,00 por dia/);
    expect(batchDetails({lifetimeBudget:1000,currency:'BRL'})).toMatch(/R\$\s?10,00 no total/);
    expect(batchDetails({daily_budget_cents:1000,currency:'BRL'})).toMatch(/R\$\s?10,00 por dia/);
  });
  it.each([undefined,'USD','XXX'])('não fabrica reais quando a moeda é %s', currency => {
    const text=batchDetails({dailyBudget:1000,currency});
    expect(text).not.toContain('R$');
    expect(text).toContain('1000 unidades menores');
    expect(text).toMatch(/moeda não confirmada|moeda USD/);
  });
  it.each([-1,NaN,Infinity,1.5,'1000',null])('não inventa orçamento para %s', dailyBudget => {
    const text=batchDetails({dailyBudget,currency:'BRL'});
    expect(text).toContain('Valor não informado');
    expect(text).not.toContain('R$');
  });
  it('preserva moeda específica de cada escopo sem herdar BRL em valor explicitamente USD', () => {
    expect(batchDetails({currency:'USD',atual:{currency:'BRL'},dailyBudget:1000})).not.toContain('R$');
    expect(batchDetails({currency:'BRL',alterações:{currency:'USD',dailyBudget:1000}})).not.toContain('R$');
  });
  it('traduz objetivos, formatos e status, preservando escopo, datas e legenda', () => {
    const parameters={objective:'OUTCOME_TRAFFIC',postType:'REELS',platform:'instagram',status:'PAUSED',caption:'Café para você',scheduledAt:'2026-11-20T15:00:00Z',adAccountId:'act_123',campaignId:'camp-1'};
    const text=batchDetails(parameters);
    expect(text).toContain('Levar pessoas ao site');
    expect(text).toContain('Vídeo curto (Reels)');
    expect(text).toContain('Instagram');
    expect(text).toContain('Pausado');
    expect(text).toContain('Café para você');
    expect(text).toContain('20/11/2026');
    expect(text).toContain('12:00');
    expect(text).toContain('São Paulo');
    expect(text).toContain('act_123');
    expect(text).toContain('camp-1');
    expect(text).not.toContain('OUTCOME_TRAFFIC');
  });
  it('separa campos técnicos do texto principal sem revelar parâmetros privados', () => {
    const parameters=Object.freeze({model:'model-uuid',version:3,aspect_ratio:'9:16',resolution:'1080p',caption:'Oferta',secret:'senha privada'});
    expect(batchDetails(parameters)).not.toMatch(/model-uuid|9:16|1080p|Versão|senha privada/);
    expect(batchAdvancedDetails(parameters)).toContain('Modelo: model-uuid');
    expect(batchAdvancedDetails(parameters)).toContain('Proporção: 9:16');
    expect(batchAdvancedDetails(parameters)).not.toContain('senha privada');
    expect(parameters.version).toBe(3);
  });
  it('não apresenta códigos desconhecidos como linguagem de negócio', () => {
    expect(batchDetails({objective:'OUTCOME_SECRET',status:'INTERNAL_X',postType:'SECRET'})).not.toMatch(/OUTCOME_SECRET|INTERNAL_X|SECRET/);
  });
});

describe('Prévia segura da mídia revisada', () => {
  it('extrai, deduplica e não altera imageUrl/image_urls/videoUrl', () => {
    const images=Object.freeze(['https://example.test/a.png','https://example.test/b.png']);
    const parameters=Object.freeze({imageUrl:images[0],image_urls:images,videoUrl:'https://example.test/v.mp4'});
    expect(batchMedia(parameters)).toEqual([
      {kind:'image',url:images[0]},{kind:'image',url:images[1]},{kind:'video',url:parameters.videoUrl},
    ]);
    expect(parameters.image_urls).toBe(images);
  });
  it.each(['http://example.test/a.png','javascript:alert(1)','data:image/png;base64,a','/private/a.png','https://user:pass@example.test/a.png','https://','https://example.test/\nsecret'])('recusa URL não segura %s', imageUrl => {
    expect(batchMedia({imageUrl})).toEqual([]);
  });
});
