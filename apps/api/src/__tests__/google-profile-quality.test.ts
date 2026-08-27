/**
 * Testes unitários da avaliação de qualidade/recência de um perfil do Google
 * Meu Negócio (SPRINT 7). Cobre a função pura `assessGoogleProfileQuality`:
 * completude (campos obrigatórios/recomendados), verificação, recência
 * (desatualizado), score/grade e warnings em PT-BR.
 * Sem DB e sem HTTP — só a função pura.
 */
import { describe, it, expect } from 'vitest';
import { assessGoogleProfileQuality, type GoogleQualityReport } from '../services/google/google.service.js';
import type { GbpLocation } from '../lib/google-api.js';

const NOW = new Date('2026-08-26T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * DAY).toISOString();
}

function completeLocation(): GbpLocation {
  return {
    name: 'accounts/1/locations/abc',
    title: 'Padaria do Bairro',
    address: {
      addressLines: ['Rua das Flores, 100'],
      locality: 'São Paulo',
      administrativeArea: 'SP',
      postalCode: '01000-000',
      regionCode: 'BR',
    },
    phoneNumbers: { primaryPhone: '+55 11 99999-9999' },
    websiteUri: 'https://padaria.com.br',
    categories: [{ categoryId: 'gcid:bakery', displayName: 'Padaria' }],
    openInfo: { periods: [{ openDay: 'MONDAY', openTime: '08:00', closeTime: '18:00' }] as never },
    verification: { state: 'VERIFIED' },
    metadata: { updateTime: daysAgo(30), placeId: 'ChIJxxx' },
  };
}

describe('assessGoogleProfileQuality', () => {
  it('classifica como EXCELLENT um perfil completo, verificado e recente', () => {
    const report: GoogleQualityReport = assessGoogleProfileQuality(completeLocation(), NOW);

    expect(report.grade).toBe('EXCELLENT');
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.complete).toBe(true);
    expect(report.verified).toBe(true);
    expect(report.outdated).toBe(false);
    expect(report.missingFields).toEqual([]);
  });

  it('marca como incompleto quando faltam campos obrigatórios e gera warnings em PT-BR', () => {
    const report = assessGoogleProfileQuality(
      {
        name: 'accounts/1/locations/abc',
        title: 'Padaria do Bairro',
        address: { regionCode: 'BR' },
        verification: { state: 'UNVERIFIED' },
      },
      NOW
    );

    expect(report.complete).toBe(false);
    expect(report.missingFields).toContain('phone');
    expect(report.missingFields).toContain('address');
    expect(report.grade).toBe('POOR');
    expect(report.warnings.some((w) => /telefone/i.test(w))).toBe(true);
  });

  it('considera webside/categoria/horário como recomendações, não campos obrigatórios', () => {
    const loc = completeLocation();
    delete loc.websiteUri;
    loc.categories = undefined;
    loc.openInfo = undefined;

    const report = assessGoogleProfileQuality(loc, NOW);

    expect(report.complete).toBe(true); // obrigatórios presentes
    expect(report.missingFields).toEqual([]);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('marca como desatualizado (outdated=true) quando updateTime é antigo', () => {
    const loc = completeLocation();
    (loc.metadata as Record<string, unknown>).updateTime = daysAgo(400);

    const report = assessGoogleProfileQuality(loc, NOW);

    expect(report.outdated).toBe(true);
    expect(report.lastUpdated).toBe(daysAgo(400));
    expect(report.warnings.some((w) => /desatualiz/i.test(w))).toBe(true);
  });

  it('retorna outdated=null quando não há timestamp de atualização', () => {
    const loc = completeLocation();
    loc.metadata = { placeId: 'ChIJxxx' };

    const report = assessGoogleProfileQuality(loc, NOW);

    expect(report.outdated).toBeNull();
    expect(report.lastUpdated).toBeNull();
  });

  it('não cobra penalidade de recência em perfil desatualizado que já está POOR/baixo', () => {
    // perfil sem nenhum campo obrigatório: score fica no piso (baixo)
    const report = assessGoogleProfileQuality({}, NOW);

    expect(report.score).toBeLessThan(50);
    expect(report.grade).toBe('POOR');
    expect(report.complete).toBe(false);
  });
});