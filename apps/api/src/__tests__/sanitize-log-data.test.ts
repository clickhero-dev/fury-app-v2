import { describe, it, expect } from 'vitest';
import { sanitizeHeaders, sanitizeBody } from '../lib/sanitize-log-data.js';

describe('sanitize-log-data', () => {
  it('sanitizeHeaders removes sensitive headers', () => {
    const input = { 'authorization': 'Bearer xyz', 'content-type': 'json', 'cookie': 'session=abc' };
    const result = sanitizeHeaders(input);
    expect(result).not.toHaveProperty('authorization');
    expect(result).not.toHaveProperty('cookie');
    expect(result).toHaveProperty('content-type', 'json');
  });

  it('sanitizeHeaders is case-insensitive', () => {
    const result = sanitizeHeaders({ 'Authorization': 'Bearer xyz', 'Set-Cookie': 'a=b' });
    expect(result).toEqual({});
  });

  it('sanitizeBody redacts sensitive keys', () => {
    const input = { email: 'user@x.com', password: 'secret', token: 'abc' };
    const result = sanitizeBody(input);
    expect(result).toEqual({ email: 'user@x.com', password: '[REDACTED]', token: '[REDACTED]' });
  });

  it('sanitizeBody handles arrays', () => {
    const input = [{ password: 'secret' }, { name: 'ok' }];
    const result = sanitizeBody(input);
    expect(result).toEqual([{ password: '[REDACTED]' }, { name: 'ok' }]);
  });

  it('sanitizeBody handles null/undefined/primitives', () => {
    expect(sanitizeBody(null)).toBe(null);
    expect(sanitizeBody(undefined)).toBe(undefined);
    expect(sanitizeBody('string')).toBe('string');
    expect(sanitizeBody(42)).toBe(42);
  });

  it('sanitizeBody respects maxDepth', () => {
    const input = { a: { b: { c: { d: 'deep' } } } };
    // default depth 5 → reaches d
    const result = sanitizeBody(input);
    expect(result).toEqual({ a: { b: { c: { d: 'deep' } } } });
  });
});
