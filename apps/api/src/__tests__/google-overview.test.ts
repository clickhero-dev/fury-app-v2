/**
 * Funções puras do painel do dono / cartão público (spec 015, Fase 1).
 */
import { describe, it, expect } from 'vitest';
import {
  buildReviewLink,
  buildSuggestions,
  categoryTab,
  computeOpenStatus,
  computeProfileStrength,
  formatAddress,
  formatWeeklyHours,
  resolveCategoryActions,
  resolveTimeZone,
  safeGoogleUrl,
  safeHttpUrl,
  safeHttpsUrl,
} from '../services/google/google.overview.js';
import type { GbpLocation, GbpOpenPeriod } from '../lib/google-api.js';

const SP = 'America/Sao_Paulo';
// 2026-10-21 é quarta-feira; SP = UTC-3
const at = (iso: string) => new Date(iso);

function period(day: string, open: number, close: number, closeDay = day): GbpOpenPeriod {
  return { openDay: day, openTime: { hours: open }, closeDay, closeTime: { hours: close } };
}

const WEEKDAYS_8_18 = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].map((d) => period(d, 8, 18));

describe('computeOpenStatus', () => {
  it('aberto durante o expediente', () => {
    expect(computeOpenStatus(WEEKDAYS_8_18, [], at('2026-10-21T13:00:00Z'), SP)).toEqual({
      state: 'open',
      label: 'Aberto · Fecha 18:00',
    });
  });

  it('fecha em breve na última hora', () => {
    expect(computeOpenStatus(WEEKDAYS_8_18, [], at('2026-10-21T20:30:00Z'), SP).label).toBe('Fecha em breve · Fecha 18:00');
  });

  it('fechado antes de abrir no mesmo dia', () => {
    expect(computeOpenStatus(WEEKDAYS_8_18, [], at('2026-10-21T09:00:00Z'), SP).label).toBe('Fechado · Abre às 08:00');
  });

  it('fechado à noite abre amanhã', () => {
    expect(computeOpenStatus(WEEKDAYS_8_18, [], at('2026-10-21T23:00:00Z'), SP).label).toBe('Fechado · Abre amanhã às 08:00');
  });

  it('sexta à noite abre seg.', () => {
    expect(computeOpenStatus(WEEKDAYS_8_18, [], at('2026-10-23T23:00:00Z'), SP).label).toBe('Fechado · Abre seg. às 08:00');
  });

  it('expediente que vira a meia-noite continua aberto de madrugada', () => {
    const bar = [period('TUESDAY', 18, 2, 'WEDNESDAY')];
    // quarta 00:30 em SP
    expect(computeOpenStatus(bar, [], at('2026-10-21T03:30:00Z'), SP)).toEqual({
      state: 'open',
      label: 'Aberto · Fecha 02:00',
    });
  });

  it('closeTime 24 fecha à meia-noite', () => {
    const periods = [period('WEDNESDAY', 10, 24)];
    expect(computeOpenStatus(periods, [], at('2026-10-21T22:00:00Z'), SP).label).toBe('Aberto · Fecha 00:00');
  });

  it('aberto 24 horas todos os dias', () => {
    const allDay = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].map((d, i, days) =>
      period(d, 0, 0, days[(i + 1) % 7]),
    );
    expect(computeOpenStatus(allDay, [], at('2026-10-21T15:00:00Z'), SP).label).toBe('Aberto 24 horas');
  });

  it('múltiplos intervalos no dia (almoço fechado)', () => {
    const split = [period('WEDNESDAY', 8, 12), period('WEDNESDAY', 14, 18)];
    expect(computeOpenStatus(split, [], at('2026-10-21T16:00:00Z'), SP).label).toBe('Fechado · Abre às 14:00');
  });

  it('sem horário retorna unknown', () => {
    expect(computeOpenStatus(undefined, undefined, at('2026-10-21T13:00:00Z'), SP)).toEqual({
      state: 'unknown',
      label: 'Horário não informado',
    });
  });

  it('horário especial fechado (feriado) sobrepõe o regular', () => {
    const holiday = [{ startDate: { year: 2026, month: 10, day: 21 }, closed: true }];
    expect(computeOpenStatus(WEEKDAYS_8_18, holiday, at('2026-10-21T13:00:00Z'), SP).label).toBe(
      'Fechado · Abre amanhã às 08:00',
    );
  });

  it('horário especial reduzido', () => {
    const special = [
      { startDate: { year: 2026, month: 10, day: 21 }, openTime: { hours: 9 }, closeTime: { hours: 12 } },
    ];
    expect(computeOpenStatus(WEEKDAYS_8_18, special, at('2026-10-21T13:00:00Z'), SP).label).toBe('Aberto · Fecha 12:00');
  });

  it('usa o fuso da UF (Manaus = UTC-4)', () => {
    // 11:30Z = 08:30 em SP (aberto) e 07:30 em Manaus (fechado)
    const now = at('2026-10-21T11:30:00Z');
    expect(computeOpenStatus(WEEKDAYS_8_18, [], now, resolveTimeZone('SP')).state).toBe('open');
    expect(computeOpenStatus(WEEKDAYS_8_18, [], now, resolveTimeZone('AM')).state).toBe('closed');
  });
});

describe('resolveTimeZone', () => {
  it('UF fora de UTC-3 e padrão SP', () => {
    expect(resolveTimeZone('am')).toBe('America/Manaus');
    expect(resolveTimeZone('AC')).toBe('America/Rio_Branco');
    expect(resolveTimeZone('BA')).toBe('America/Sao_Paulo');
    expect(resolveTimeZone(undefined)).toBe('America/Sao_Paulo');
  });
});

describe('formatWeeklyHours', () => {
  it('semana começa na segunda e dia fechado fica vazio', () => {
    const week = formatWeeklyHours([period('MONDAY', 8, 18), period('SUNDAY', 9, 13)]);
    expect(week.map((d) => d.day)).toEqual([
      'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
    ]);
    expect(week[0].ranges).toEqual([{ open: '08:00', close: '18:00' }]);
    expect(week[1].ranges).toEqual([]);
    expect(week[6].ranges).toEqual([{ open: '09:00', close: '13:00' }]);
  });
});

const fullLocation: GbpLocation = {
  title: 'Padaria',
  categories: [{ categoryId: 'gcid:bakery' }],
  address: { addressLines: ['Rua A, 1'], locality: 'São Paulo' },
  phoneNumbers: { primaryPhone: '+5511999999999' },
  websiteUri: 'https://padaria.com.br',
  openInfo: { periods: WEEKDAYS_8_18 },
  description: 'Padaria artesanal com pães de fermentação natural e café especial.',
};

describe('computeProfileStrength', () => {
  it('100% com tudo preenchido, verificado e 3 fotos', () => {
    const report = computeProfileStrength(fullLocation, { verified: true, photoCount: 3 });
    expect(report).toMatchObject({ percent: 100, complete: true, missingCount: 0 });
  });

  it('desconta pelos pesos dos itens faltantes', () => {
    const report = computeProfileStrength(
      { ...fullLocation, description: 'curta', openInfo: undefined },
      { verified: true, photoCount: 3 },
    );
    // faltam descrição (10) e horário (15) de 95
    expect(report.percent).toBe(Math.round((100 * 70) / 95));
    expect(report.items.filter((i) => !i.done).map((i) => i.key)).toEqual(['hours', 'description']);
  });

  it('perfil vazio', () => {
    const report = computeProfileStrength({}, { verified: false, photoCount: 0 });
    expect(report.percent).toBe(0);
    expect(report.missingCount).toBe(9);
  });
});

describe('resolveCategoryActions', () => {
  const keys = (location: GbpLocation, verified = true) =>
    resolveCategoryActions(location, verified).map((a) => a.key);

  it('ordem do Google com ação de categoria depois de Anunciar', () => {
    expect(keys(fullLocation)).toEqual([
      'edit_profile', 'reviews', 'photos', 'posts', 'performance', 'ads', 'menu', 'request_reviews', 'profiles',
    ]);
  });

  it('hotel tem Detalhes do hotel e nunca Editar diárias nem Q&A', () => {
    const actions = resolveCategoryActions({ categories: [{ categoryId: 'gcid:hotel' }] }, true);
    expect(actions.map((a) => a.key)).toContain('hotel_details');
    expect(actions.some((a) => /diária|pergunta/i.test(a.label))).toBe(false);
  });

  it('flags de metadata têm prioridade sobre a categoria', () => {
    expect(keys({ categories: [{ categoryId: 'gcid:store' }], metadata: { canOperateLodgingData: true } })).toContain(
      'hotel_details',
    );
    expect(keys({ metadata: { canHaveFoodMenus: true } })).toContain('menu');
  });

  it('varejo → Produtos; demais → Serviços', () => {
    expect(keys({ categories: [{ categoryId: 'gcid:clothing_store' }] })).toContain('products');
    expect(keys({ categories: [{ categoryId: 'gcid:dentist' }] })).toContain('services');
  });

  it('ação de categoria abre o Google', () => {
    const menu = resolveCategoryActions(fullLocation, true).find((a) => a.key === 'menu');
    expect(menu).toMatchObject({ kind: 'category', status: 'external', externalUrl: 'https://business.google.com/' });
  });

  it('status: disponível, em breve e exige verificação', () => {
    const byKey = (verified: boolean) =>
      Object.fromEntries(resolveCategoryActions(fullLocation, verified).map((a) => [a.key, a.status]));
    expect(byKey(true)).toMatchObject({
      edit_profile: 'available', photos: 'available', ads: 'available', profiles: 'available',
      reviews: 'coming_soon', posts: 'coming_soon', performance: 'coming_soon', request_reviews: 'coming_soon',
    });
    expect(byKey(false)).toMatchObject({
      edit_profile: 'available', reviews: 'requires_verification', ads: 'requires_verification',
      request_reviews: 'requires_verification',
    });
  });

  it('categoryTab segue a ação de categoria (hotel não tem aba extra)', () => {
    expect(categoryTab(fullLocation)).toBe('menu');
    expect(categoryTab({ categories: [{ categoryId: 'gcid:hotel' }] })).toBeNull();
  });
});

describe('buildSuggestions', () => {
  const strength = (complete: boolean) => ({ percent: complete ? 100 : 60, complete, missingCount: complete ? 0 : 3, items: [] });

  it('não verificado: verificar primeiro, sem anúncio', () => {
    const ids = buildSuggestions({ verified: false, strength: strength(false), hasAdsCampaign: false }).map((s) => s.id);
    expect(ids).toEqual(['verify_profile', 'complete_profile']);
  });

  it('verificado e incompleto sem campanha', () => {
    const ids = buildSuggestions({ verified: true, strength: strength(false), hasAdsCampaign: false }).map((s) => s.id);
    expect(ids).toEqual(['complete_profile', 'create_ad']);
  });

  it('completo com campanha não sugere nada', () => {
    expect(buildSuggestions({ verified: true, strength: strength(true), hasAdsCampaign: true })).toEqual([]);
  });
});

describe('formatação e links seguros', () => {
  it('formatAddress em linha única', () => {
    expect(
      formatAddress({ addressLines: ['Av. Paulista, 1000'], locality: 'São Paulo', administrativeArea: 'SP', postalCode: '01310-100' }),
    ).toBe('Av. Paulista, 1000, São Paulo - SP, 01310-100');
    expect(formatAddress(undefined)).toBe('');
  });

  it('safeHttpUrl bloqueia esquemas perigosos e credenciais', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,x')).toBeNull();
    expect(safeHttpUrl('nao é url')).toBeNull();
    expect(safeHttpUrl('https://user:pass@empresa.com.br')).toBeNull();
    expect(safeHttpUrl('https://empresa.com.br')).toBe('https://empresa.com.br/');
    expect(safeHttpUrl('http://empresa.com.br')).toBe('http://empresa.com.br/');
  });

  it('safeHttpsUrl recusa http', () => {
    expect(safeHttpsUrl('http://cdn.ady.com.br/a.jpg')).toBeNull();
    expect(safeHttpsUrl('https://cdn.ady.com.br/a.jpg')).toBe('https://cdn.ady.com.br/a.jpg');
  });

  it('safeGoogleUrl só aceita https em host exato de Maps/avaliação', () => {
    expect(safeGoogleUrl('https://maps.google.com/?cid=1')).toBe('https://maps.google.com/?cid=1');
    expect(safeGoogleUrl('https://maps.app.goo.gl/x')).toBe('https://maps.app.goo.gl/x');
    expect(safeGoogleUrl('https://www.google.com.br/maps')).toBe('https://www.google.com.br/maps');
    expect(safeGoogleUrl('https://MAPS.GOOGLE.COM/')).toBe('https://maps.google.com/');
    expect(safeGoogleUrl('http://maps.google.com/')).toBeNull();
    expect(safeGoogleUrl('https://google.com.evil.io/')).toBeNull();
    expect(safeGoogleUrl('https://google.com.ru/')).toBeNull();
    expect(safeGoogleUrl('https://evilgoogle.com/')).toBeNull();
    expect(safeGoogleUrl('https://sites.google.com/view/x')).toBeNull();
    expect(safeGoogleUrl('https://google.com@evil.io/')).toBeNull();
    expect(safeGoogleUrl('https://user:pass@maps.google.com/')).toBeNull();
    expect(safeGoogleUrl('https://maps.google.com:8443/')).toBeNull();
    expect(safeGoogleUrl('https://xn--ggle-0nda.com/')).toBeNull();
    expect(safeGoogleUrl('https://maps.google.com./')).toBeNull();
  });

  it('buildReviewLink usa newReviewUri ou monta pelo placeId', () => {
    expect(buildReviewLink({ newReviewUri: 'https://search.google.com/local/writereview?placeid=X' })).toBe(
      'https://search.google.com/local/writereview?placeid=X',
    );
    expect(buildReviewLink({ newReviewUri: 'https://evil.io/', placeId: 'Ch IJ' })).toBe(
      'https://search.google.com/local/writereview?placeid=Ch%20IJ',
    );
    expect(buildReviewLink(undefined)).toBeNull();
  });
});
