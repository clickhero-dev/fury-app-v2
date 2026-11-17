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
  toggleView,
  viewVisible,
  blockedSummary,
  type PlanDraft,
} from './planForm';

const base: PlanDraft = { name: 'Pro', priceCents: 39700, interval: 'monthly', isActive: true, limits: EMPTY_LIMITS, blockedViews: [] };

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

describe('o que o cliente vê', () => {
  const views = [
    { key: 'campaigns', description: 'Campanhas', group: 'ads' as const, parent: null, locked: false },
    { key: 'leads', description: 'Leads', group: 'ads' as const, parent: 'campaigns', locked: false },
    { key: 'studio', description: 'Estúdio', group: 'content' as const, parent: null, locked: false },
    { key: 'studio.image', description: 'Imagem', group: 'content' as const, parent: 'studio', locked: false },
    { key: 'studio.video', description: 'Vídeo', group: 'content' as const, parent: 'studio', locked: false },
  ];

  it('tirar o pai leva as filhas (pelo pai da lista, não pelo nome); religar devolve', () => {
    const off = toggleView(['studio.video'], 'studio', views);
    expect(off).toEqual(['studio']);
    expect(viewVisible(off, 'studio.image', views)).toBe(false);
    expect(toggleView(off, 'studio', views)).toEqual([]);
    // leads é filha de campanhas
    expect(viewVisible(['campaigns'], 'leads', views)).toBe(false);
    expect(toggleView(['leads'], 'campaigns', views)).toEqual(['campaigns']);
  });

  it('planChanges só manda funcionalidades quando o conjunto muda', () => {
    const orig = { ...base, blockedViews: ['leads', 'studio'] };
    expect(planChanges(orig, { ...orig, blockedViews: ['studio', 'leads'] })).toEqual({});
    expect(planChanges(orig, { ...orig, blockedViews: ['leads'] })).toEqual({ blockedViews: ['leads'] });
  });

  it('resumo do card', () => {
    expect(blockedSummary(0)).toBe('Tudo liberado');
    expect(blockedSummary(1)).toBe('1 funcionalidade bloqueada');
    expect(blockedSummary(3)).toBe('3 funcionalidades bloqueadas');
  });
});
