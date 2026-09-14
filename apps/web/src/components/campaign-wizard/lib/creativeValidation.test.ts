import { describe, expect, it } from 'vitest';
import { isCreativeValid, isCreativesStepValid } from './creativeValidation';
import type { WizardCreativeState } from '../types';

function makeCreative(overrides: Partial<WizardCreativeState> = {}): WizardCreativeState {
  return { id: 'c1', headline: '', primaryText: '', ...overrides };
}

describe('isCreativeValid', () => {
  it('retorna true com imagem da galeria + headline + texto', () => {
    expect(isCreativeValid(makeCreative({ assetId: 'a1', headline: 'Título', primaryText: 'Texto' }), null)).toBe(true);
  });

  it('retorna true com upload ou post do Instagram', () => {
    expect(isCreativeValid(makeCreative({ uploadUrl: 'https://cdn.jpg', headline: 'T', primaryText: 'P' }), null)).toBe(true);
    expect(isCreativeValid(makeCreative({ instagramMediaId: 'ig-1', headline: 'T', primaryText: 'P' }), null)).toBe(true);
  });

  it('retorna false sem imagem', () => {
    expect(isCreativeValid(makeCreative({ headline: 'T', primaryText: 'P' }), null)).toBe(false);
  });

  it('retorna false com headline ou texto vazios', () => {
    expect(isCreativeValid(makeCreative({ assetId: 'a1', headline: '', primaryText: 'P' }), null)).toBe(false);
    expect(isCreativeValid(makeCreative({ assetId: 'a1', headline: 'T', primaryText: '   ' }), null)).toBe(false);
  });

  it('para visits exige destinationUrl http(s)', () => {
    const base = makeCreative({ assetId: 'a1', headline: 'T', primaryText: 'P' });
    expect(isCreativeValid(base, 'visits')).toBe(false);
    expect(isCreativeValid({ ...base, destinationUrl: 'wa.me/55' }, 'visits')).toBe(false);
    expect(isCreativeValid({ ...base, destinationUrl: 'https://site.com' }, 'visits')).toBe(true);
  });

  it('não exige URL para objetivos que não são visits', () => {
    const base = makeCreative({ assetId: 'a1', headline: 'T', primaryText: 'P' });
    for (const objective of ['engagement', 'messages', 'whatsapp', 'whatsapp_conv']) {
      expect(isCreativeValid(base, objective)).toBe(true);
    }
  });
});

describe('isCreativesStepValid', () => {
  it('retorna false para lista vazia', () => {
    expect(isCreativesStepValid([], null)).toBe(false);
  });

  it('retorna true quando todos os criativos são válidos', () => {
    const creatives = [
      makeCreative({ id: 'c1', assetId: 'a1', headline: 'T1', primaryText: 'P1' }),
      makeCreative({ id: 'c2', uploadUrl: 'https://x.jpg', headline: 'T2', primaryText: 'P2' }),
    ];
    expect(isCreativesStepValid(creatives, null)).toBe(true);
  });

  it('retorna false quando qualquer criativo é inválido', () => {
    const creatives = [
      makeCreative({ id: 'c1', assetId: 'a1', headline: 'T1', primaryText: 'P1' }),
      makeCreative({ id: 'c2', headline: 'T2', primaryText: '' }),
    ];
    expect(isCreativesStepValid(creatives, 'engagement')).toBe(false);
  });

  it('aplica a regra de visits a todos os criativos', () => {
    const creatives = [
      makeCreative({ id: 'c1', assetId: 'a1', headline: 'T1', primaryText: 'P1', destinationUrl: 'https://a.com' }),
      makeCreative({ id: 'c2', assetId: 'a2', headline: 'T2', primaryText: 'P2' }),
    ];
    expect(isCreativesStepValid(creatives, 'visits')).toBe(false);
  });
});