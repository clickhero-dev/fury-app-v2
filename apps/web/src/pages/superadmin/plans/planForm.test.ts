import { describe, expect, it } from 'vitest';
import {
  EMPTY_LIMITS,
  applyLimitMode,
  centsFromInput,
  formatCents,
  limitMode,
  limitText,
  normalizeLimits,
  planChanges,
  setLimitQty,
  validateDraft,
  type PlanDraft,
} from './planForm';

const base: PlanDraft = { name: 'Pro', priceCents: 39700, interval: 'monthly', isActive: true, limits: EMPTY_LIMITS };

describe('preço', () => {
  it('dígitos digitados viram centavos e voltam formatados em reais', () => {
    expect(centsFromInput('1990')).toBe(1990);
    expect(centsFromInput('R$ 1.234,56')).toBe(123456);
    expect(centsFromInput('')).toBe(0);
    expect(formatCents(123456)).toBe('1.234,56');
    expect(formatCents(0)).toBe('0,00');
  });
});

describe('limites', () => {
  it('vídeo ausente vale 0 (sem vídeo), como na tela antiga', () => {
    expect(normalizeLimits({ creativesPerMonth: 40, modificationsPerCreative: 3 })).toEqual({
      creativesPerMonth: 40, modificationsPerCreative: 3, videosPerMonth: 0, modificationsPerVideo: 0,
    });
  });

  it('modo e texto de cada limite', () => {
    expect(limitMode('creativesPerMonth', null)).toBe('none');
    expect(limitMode('creativesPerMonth', 0)).toBe('qty');
    expect(limitMode('videosPerMonth', 0)).toBe('off');
    expect(limitText('videosPerMonth', 0)).toBe('Sem vídeo');
    expect(limitText('creativesPerMonth', null)).toBe('Sem limite');
    expect(limitText('creativesPerMonth', 40)).toBe('40');
  });

  it('Sem vídeo zera as modificações de vídeo', () => {
    const l = applyLimitMode({ ...EMPTY_LIMITS, videosPerMonth: 10, modificationsPerVideo: 2 }, 'videosPerMonth', 'off');
    expect(l.videosPerMonth).toBe(0);
    expect(l.modificationsPerVideo).toBe(0);
  });

  it('Quantidade parte de um valor válido para a API', () => {
    expect(applyLimitMode(EMPTY_LIMITS, 'creativesPerMonth', 'qty').creativesPerMonth).toBe(10);
    expect(applyLimitMode(EMPTY_LIMITS, 'videosPerMonth', 'qty').videosPerMonth).toBe(5);
    expect(applyLimitMode(EMPTY_LIMITS, 'creativesPerMonth', 'none').creativesPerMonth).toBeNull();
  });

  it('respeita o mínimo da API em cada limite', () => {
    expect(setLimitQty(EMPTY_LIMITS, 'modificationsPerCreative', 0).modificationsPerCreative).toBe(1);
    expect(setLimitQty(EMPTY_LIMITS, 'videosPerMonth', 0).videosPerMonth).toBe(1);
    expect(setLimitQty(EMPTY_LIMITS, 'creativesPerMonth', -3).creativesPerMonth).toBe(0);
  });
});

describe('planChanges', () => {
  it('sem mudança não envia nada', () => {
    expect(planChanges(base, { ...base, limits: { ...base.limits } })).toEqual({});
  });

  it('envia só o que mudou', () => {
    expect(planChanges(base, { ...base, name: 'Pro Max', isActive: false })).toEqual({ name: 'Pro Max', isActive: false });
    const limits = { ...base.limits, creativesPerMonth: 50 };
    expect(planChanges(base, { ...base, limits })).toEqual({ limits });
  });
});

describe('validateDraft', () => {
  it('pede nome e preço maior que zero ao criar', () => {
    expect(validateDraft({ ...base, name: '  ', priceCents: 0 })).toEqual({
      name: 'Informe o nome do plano.', price: 'O preço precisa ser maior que zero.',
    });
    expect(validateDraft(base)).toEqual({});
  });

  it('plano gratuito existente (Trial) segue editável com preço zero', () => {
    const trial = { ...base, priceCents: 0 };
    expect(validateDraft({ ...trial, name: 'Trial' }, trial)).toEqual({});
    expect(validateDraft({ ...base, priceCents: 0 }, base).price).toBeDefined();
  });
});

describe('applyLimitMode no mesmo modo', () => {
  it('não troca o valor quando o modo não muda', () => {
    const l = { ...EMPTY_LIMITS, creativesPerMonth: 0 };
    expect(applyLimitMode(l, 'creativesPerMonth', 'qty')).toBe(l);
  });
});
