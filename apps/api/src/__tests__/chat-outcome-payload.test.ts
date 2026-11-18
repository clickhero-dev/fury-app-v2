import { describe, expect, it } from 'vitest';
import { encodeChatOutcome } from '../services/core/chat-outcome-payload.js';

describe('Payload persistido de efeitos do chat', () => {
  it('preserva referências de domínio e omite credenciais sem alterar a fonte', () => {
    const source = { data: { id: 'asset', url: 'https://example.invalid/image.png', token: 'private', note: 'Bearer private' } };
    const result = JSON.parse(encodeChatOutcome(source));
    expect(result.data).toEqual({ id: 'asset', url: 'https://example.invalid/image.png', note: '[credencial omitida]' });
    expect(source.data.token).toBe('private');
  });
  it.each([null, [], 'invalid', { success: false }, { error: 'not success' }, { partial_failures: ['effect'] }, { data: Number.NaN }, { date: new Date('invalid') }, { text: 'x'.repeat(262145) }])('recusa payload ambíguo ou excessivo %j', value => {
    expect(() => encodeChatOutcome(value)).toThrow('Não foi possível preservar o resultado da ação.');
  });
  it('recusa ciclos sem expor objeto ou diagnóstico', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => encodeChatOutcome(value)).toThrow('Não foi possível preservar o resultado da ação.');
  });
  it('serializa datas válidas e arrays de artefatos', () => {
    expect(JSON.parse(encodeChatOutcome({ createdAt: new Date('2026-01-01T00:00:00Z'), assets: [{ id: 'asset' }] }))).toEqual({
      createdAt: '2026-01-01T00:00:00.000Z', assets: [{ id: 'asset' }],
    });
  });
});
