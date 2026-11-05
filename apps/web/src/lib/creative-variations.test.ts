import { describe, expect, it } from 'vitest';
import { variationDirections } from './creative-variations';

describe('variationDirections', () => {
  it('provides three distinct directions to generate complementary creative variations', () => {
    expect(variationDirections).toHaveLength(3);
    expect(new Set(variationDirections).size).toBe(3);
    expect(variationDirections.every((direction) => direction.length > 20)).toBe(true);
  });
});
