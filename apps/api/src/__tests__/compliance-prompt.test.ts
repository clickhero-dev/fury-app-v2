import { describe, expect, it } from 'vitest';
import { buildComplianceUserPrompt } from '../services/studio/compliance-prompt.js';

describe('buildComplianceUserPrompt', () => {
  it('traz os critérios base + qualidade de anúncio Facebook/Instagram (Canvas)', () => {
    const prompt = buildComplianceUserPrompt();
    expect(prompt).toContain('Texto proibido pelo Meta');
    expect(prompt).toContain('Conteúdo enganoso');
    expect(prompt).toContain('Texto bugado');
    expect(prompt.toLowerCase()).toContain('canvas');
    expect(prompt.toLowerCase()).toContain('facebook');
    expect(prompt.toLowerCase()).toContain('instagram');
  });

  it('inclui o prompt original da imagem como parâmetro de fidelidade', () => {
    const prompt = buildComplianceUserPrompt({ promptOriginal: 'Vitrine de padaria com pães artesanais' });
    expect(prompt).toContain('Vitrine de padaria com pães artesanais');
    expect(prompt).toContain('Fidelidade ao prompt');
  });

  it('inclui o brand kit (cores e tom de voz) como critério de conformidade', () => {
    const prompt = buildComplianceUserPrompt({
      brandKit: { primaryColor: '#ff7800', secondaryColor: '#f6f5f4', voiceTone: 'premium' },
    });
    expect(prompt).toContain('#ff7800');
    expect(prompt).toContain('premium');
    expect(prompt).toContain('brand kit');
  });

  it('não menciona cores quando não há brand kit', () => {
    expect(buildComplianceUserPrompt()).not.toContain('cor primária');
  });
});