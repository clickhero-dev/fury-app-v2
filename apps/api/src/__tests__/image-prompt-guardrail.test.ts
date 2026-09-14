import { describe, expect, it } from 'vitest';
import { sanitizeImagePromptForBusiness } from '../services/llms/image-prompt-guardrail.js';

describe('sanitizeImagePromptForBusiness', () => {
  it('remove menções a tecnologia quando o nicho NÃO é tech e anexa o produto real', () => {
    const dirty =
      'Fundo escuro premium com destaque laranja.\nUma tela de software de gestão para padarias com ícones.\nEstilo minimalista.';
    const out = sanitizeImagePromptForBusiness(dirty, { niche: 'padaria', mainProduct: 'pães artesanais' });
    expect(out).not.toContain('software');
    expect(out).not.toContain('ícones');
    expect(out).toContain('pães artesanais'); // produto real garantido
  });

  it('mantém o prompt intacto quando o nicho É tecnologia', () => {
    const prompt = 'Dashboard de software com gráficos e telas modernas.';
    const out = sanitizeImagePromptForBusiness(prompt, { niche: 'empresa de software', mainProduct: 'sites, aplicativos' });
    expect(out).toBe(prompt);
  });

  it('não anexa o produto se o prompt já o menciona', () => {
    const prompt = 'Vitrine de pães artesanais com crosta dourada.';
    const out = sanitizeImagePromptForBusiness(prompt, { niche: 'padaria', mainProduct: 'pães artesanais' });
    expect(out).toBe(prompt);
  });
});