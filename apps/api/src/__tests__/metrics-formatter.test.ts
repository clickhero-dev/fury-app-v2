import { describe, it, expect } from 'vitest';
import {
  centavosToReais,
  roundToDecimals,
  calculateCTR,
  calculateCPM,
  calculateCPA,
  aggregateDailyMetrics,
} from '../utils/metrics-formatter.js';

describe('metrics-formatter', () => {
  it('roundToDecimals', () => {
    expect(roundToDecimals(1.234, 2)).toBe(1.23);
    expect(roundToDecimals(1.235, 2)).toBe(1.24);
    expect(roundToDecimals(1.5, 0)).toBe(2);
  });

  it('centavosToReais', () => {
    expect(centavosToReais(100)).toBe(1);
    expect(centavosToReais(0)).toBe(0);
    expect(centavosToReais(99)).toBe(0.99);
    expect(centavosToReais(150)).toBe(1.5);
  });

  it('calculateCTR', () => {
    expect(calculateCTR(10, 100)).toBe(10);
    expect(calculateCTR(0, 100)).toBe(0);
    expect(calculateCTR(10, 0)).toBe(0);
  });

  it('calculateCPM', () => {
    // 500 centavos (R$5) / 1000 impressions * 1000 = R$5 CPM
    expect(calculateCPM(500, 1000)).toBe(5);
    expect(calculateCPM(0, 1000)).toBe(0);
    expect(calculateCPM(500, 0)).toBe(0);
    // R$30 de spend, 6000 impressions → (30/6000)*1000 = R$5
    expect(calculateCPM(3000, 6000)).toBe(5);
  });

  it('calculateCPA', () => {
    expect(calculateCPA(100, 10)).toBe(10);
    expect(calculateCPA(0, 10)).toBe(0);
    expect(calculateCPA(100, 0)).toBe(0);
  });

  it('aggregateDailyMetrics', () => {
    const daily = [
      { spend: 100, impressions: 1000, clicks: 50, conversions: 5, roas: 2 },
      { spend: 200, impressions: 2000, clicks: 100, conversions: 10, roas: 3 },
    ];
    const result = aggregateDailyMetrics(daily);
    expect(result.totalSpend).toBe(300);
    expect(result.totalImpressions).toBe(3000);
    expect(result.totalClicks).toBe(150);
    expect(result.totalConversions).toBe(15);
    expect(result.avgRoas).toBe(2.5); // (2+3)/2
  });

  it('aggregateDailyMetrics empty', () => {
    const result = aggregateDailyMetrics([]);
    expect(result.totalSpend).toBe(0);
    expect(result.totalImpressions).toBe(0);
    expect(result.totalClicks).toBe(0);
    expect(result.totalConversions).toBe(0);
    expect(result.avgRoas).toBe(0);
  });
});
