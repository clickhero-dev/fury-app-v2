import { describe, it, expect, vi } from 'vitest';

// fury-engine.service importa @fury/db no topo; isolamos para testes puros.
vi.mock('@fury/db', () => ({
  db: {},
  clientGoals: {},
  campaigns: {},
  furyInsights: {},
  performanceRules: {},
  performanceScores: {},
  ruleExecutions: {},
  furyConfig: {},
}));

import {
  calculateScore,
  getGrade,
  DEFAULT_SCORE_CONFIG,
  type CampaignMetrics,
} from '../services/llms/fury-engine.service.js';

describe('calculateScore', () => {
  it('atinge 100 quando todos os alvos são batidos', () => {
    const metrics: CampaignMetrics = {
      roas: 4,   // target 4 → 40 pts
      ctr: 3,    // target 3 → 30 pts
      cpa: 50,   // target 50 → 20 pts
      spend: 80,
      budget: 100, // utilização 80% = target → 10 pts
    };
    expect(calculateScore(metrics)).toBe(100);
  });

  it('retorna 0 com métricas zeradas', () => {
    expect(calculateScore({})).toBe(0);
  });

  it('limita ROAS ao teto de 40 pts mesmo acima do target', () => {
    const score = calculateScore({ roas: 40 }); // 40/4 = 10 → capped 1 → 40 pts
    expect(score).toBe(40);
  });

  it('não pontua CPA quando cpa é zero', () => {
    const score = calculateScore({ roas: 4, ctr: 3, cpa: 0 });
    // 40 (roas) + 30 (ctr) + 0 (cpa) + 0 (util) = 70
    expect(score).toBe(70);
  });

  it('pontua CPA cheio quando cpa está abaixo do target', () => {
    const score = calculateScore({ cpa: 25 }); // 50/25=2 → capped 1 → 20 pts
    expect(score).toBe(20);
  });

  it('pontua CPA proporcional quando cpa está acima do target', () => {
    const score = calculateScore({ cpa: 100 }); // 50/100=0.5 → 10 pts
    expect(score).toBe(10);
  });

  it('dá 10 pts de utilização quando spend/budget está a ±10% do target', () => {
    // spend 85 / budget 100 = 85% → diff 5 ≤ 10 → 10 pts
    expect(calculateScore({ spend: 85, budget: 100 })).toBe(10);
    // spend 70 / budget 100 = 70% → diff 10 ≤ 10 → 10 pts
    expect(calculateScore({ spend: 70, budget: 100 })).toBe(10);
  });

  it('dá 5 pts de utilização quando está a ±20% do target', () => {
    // spend 60 / budget 100 = 60% → diff 20 → 5 pts
    expect(calculateScore({ spend: 60, budget: 100 })).toBe(5);
  });

  it('não pontua utilização quando budget ou spend é zero', () => {
    expect(calculateScore({ spend: 0, budget: 100 })).toBe(0);
    expect(calculateScore({ spend: 50, budget: 0 })).toBe(0);
  });
});

describe('getGrade', () => {
  it('classifica pelas faixas corretas', () => {
    expect(getGrade(100)).toBe('A');
    expect(getGrade(90)).toBe('A');
    expect(getGrade(89)).toBe('B');
    expect(getGrade(75)).toBe('B');
    expect(getGrade(74)).toBe('C');
    expect(getGrade(60)).toBe('C');
    expect(getGrade(59)).toBe('D');
    expect(getGrade(40)).toBe('D');
    expect(getGrade(39)).toBe('F');
    expect(getGrade(0)).toBe('F');
  });
});

describe('DEFAULT_SCORE_CONFIG', () => {
  it('expõe os alvos padrão', () => {
    expect(DEFAULT_SCORE_CONFIG).toEqual({
      targetRoas: 4.0,
      targetCpa: 50.0,
      targetCtr: 3.0,
      targetBudgetUtilization: 80,
    });
  });
});
