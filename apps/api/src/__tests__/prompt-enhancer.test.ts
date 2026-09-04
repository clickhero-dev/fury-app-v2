import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ chat: vi.fn() }));

vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: { chat: state.chat },
}));

import { enhancePromptForImage } from '../services/llms/prompt-enhancer.js';

describe('enhancePromptForImage', () => {
  beforeEach(() => {
    state.chat.mockReset();
    process.env.OPENROUTER_API_KEY = 'test-or-key';
  });

  it('proíbe texto/letras na imagem (evita anúncio com textos literalizados tipo "FURY")', async () => {
    state.chat.mockResolvedValue('Vitrine de padaria à noite, iluminação quente.');
    await enhancePromptForImage('Padaria');
    const system = state.chat.mock.calls[0][0][0].content as string;
    expect(system.toLowerCase()).toContain('não deve conter nenhum texto');
    expect(system.toLowerCase()).toContain('letras');
  });

  it('orienta a imagem como anúncio de pequena/média empresa para Instagram/Facebook', async () => {
    state.chat.mockResolvedValue('Vitrine de padaria à noite, iluminação quente.');
    await enhancePromptForImage('Padaria');
    const system = state.chat.mock.calls[0][0][0].content as string;
    expect(system.toLowerCase()).toContain('pequena');
    expect(system.toLowerCase()).toContain('média');
    expect(system.toLowerCase()).toContain('instagram');
    expect(system.toLowerCase()).toContain('facebook');
  });

  it('retorna prompt enriquecido quando o LLM responde', async () => {
    state.chat.mockResolvedValue('Pão artesanal na vitrine, iluminação quente, close na crosta dourada.');
    const out = await enhancePromptForImage('Pão artesanal');
    expect(out).toBe('Pão artesanal na vitrine, iluminação quente, close na crosta dourada.');
    expect(state.chat).toHaveBeenCalledTimes(1);
  });

  it('mantém o prompt original quando o LLM falha (fallback seguro)', async () => {
    state.chat.mockRejectedValue(new Error('OPENROUTER_API_KEY_MISSING'));
    expect(await enhancePromptForImage('Pão artesanal')).toBe('Pão artesanal');
  });

  it('não enriquece prompts já longos (>= 100 chars)', async () => {
    const long = 'pão artesanal '.repeat(10).trim(); // 141 chars
    expect(await enhancePromptForImage(long)).toBe(long);
    expect(state.chat).not.toHaveBeenCalled();
  });
});