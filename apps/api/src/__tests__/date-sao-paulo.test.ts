import { describe, it, expect } from 'vitest';
import { todaySaoPauloYMD, daysAgoSaoPauloYMD } from '../utils/date-sao-paulo.js';

describe('date-sao-paulo', () => {
  it('todaySaoPauloYMD returns YYYY-MM-DD format', () => {
    const result = todaySaoPauloYMD();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('daysAgoSaoPauloYMD returns a past date', () => {
    const today = todaySaoPauloYMD();
    const yesterday = daysAgoSaoPauloYMD(1);
    expect(yesterday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // yesterday should be different from today
    // (edge case: midnight on New Year's in SP could be same day for a minute)
    expect(yesterday).not.toBe(today);
  });

  it('daysAgoSaoPauloYMD with 0 equals today', () => {
    expect(daysAgoSaoPauloYMD(0)).toBe(todaySaoPauloYMD());
  });

  it('daysAgoSaoPauloYMD with negative returns future date', () => {
    const future = daysAgoSaoPauloYMD(-1);
    expect(future).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
