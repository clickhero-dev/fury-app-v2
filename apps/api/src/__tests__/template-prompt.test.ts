import { describe, it, expect } from 'vitest';
import {
  numericValues,
  sanitizeTemplatePlan,
  findTemplateTextIssues,
  buildTemplateAnalysisPrompt,
  buildTemplateGenerationPrompt,
  type TemplatePlan,
} from '../services/studio/template-prompt.js';

const base: Omit<TemplatePlan, 'blocks'> = { layout: 'x', palette: [], typography: 'y' };

describe('template-prompt', () => {
  it('numericValues compara valor, não a escrita', () => {
    expect(numericValues('R$ 2.500 + comissões')).toEqual([2500]);
    expect(numericValues('média de 4 mil')).toEqual([4000]);
    expect(numericValues('R$ 5k mensais')).toEqual([5000]);
    expect(numericValues('2,5 mil')).toEqual([2500]);
    expect(numericValues('de R$ 5.000 a R$ 12.000')).toEqual([5000, 12000]);
  });

  it('sanitize aceita o mesmo valor em outro formato e mantém as quebras de linha', () => {
    const plan = sanitizeTemplatePlan({
      ...base,
      blocks: [{ position: 'card', original: 'Fixo de R$ 3.000\n(média de R$ 5k)', kind: 'specific', style: '', new_text: 'Fixo de R$ 2.500\n(média de R$ 4.000)' }],
    }, 'fixo de 2500, média de 4 mil');
    expect(plan.blocks[0].new_text).toBe('Fixo de R$ 2.500\n(média de R$ 4.000)');
  });

  it('sanitize remove valor que não está nos dados do usuário nem do cadastro', () => {
    const plan = sanitizeTemplatePlan({
      ...base,
      blocks: [{ position: 'card', original: 'até R$ 18.000', kind: 'specific', style: '', new_text: 'até R$ 18.000' }],
    }, 'fixo de 2.500');
    expect(plan.blocks[0].new_text).toBeNull();
  });

  it('análise recebe os dados do cadastro como fonte secundária', () => {
    const prompt = buildTemplateAnalysisPrompt('vaga', { businessName: 'DUO Oral Care', city: 'Joinville-SC' });
    expect(prompt).toContain('Nome da empresa: DUO Oral Care');
    expect(prompt).toContain('Cidade da empresa: Joinville-SC');
  });

  it('revisão detecta erro de acento, linha faltando e sobra do original', () => {
    const plan: TemplatePlan = {
      ...base,
      blocks: [
        { position: 'a', original: 'GV Uniformes', kind: 'specific', style: '', new_text: 'DUO Oral Care' },
        { position: 'b', original: 'Fixo', kind: 'specific', style: '', new_text: 'Fixo de R$ 2.500\nmédia de R$ 4 mil' },
        { position: 'c', original: 'exclusivo para Toledo-PR', kind: 'specific', style: '', new_text: null },
        { position: 'd', original: 'VAGAS', kind: 'generic', style: '', new_text: 'VAGAS' },
      ],
    };
    const issues = findTemplateTextIssues(plan, { texts: ['VAGAS', 'DUO Oral Care', 'Fixo de R$ 2.500', 'media de R$ 4 mil', 'exclusivo para Toledo-PR'] });
    expect(issues).toEqual([
      { type: 'missing', text: 'Fixo de R$ 2.500\nmédia de R$ 4 mil' },
      { type: 'leftover', text: 'exclusivo para Toledo-PR' },
    ]);
    expect(findTemplateTextIssues(plan, { texts: ['VAGAS', 'DUO Oral Care', 'Fixo de R$ 2.500', 'média de R$ 4 mil'] })).toEqual([]);
  });

  it('com foto, a revisão também acusa pessoa ausente ou encostando em texto', () => {
    const plan: TemplatePlan = { ...base, blocks: [{ position: 'a', original: 'VAGAS', kind: 'generic', style: '', new_text: 'VAGAS' }] };
    expect(findTemplateTextIssues(plan, { texts: ['VAGAS'], subject_visible: false, subject_covers_text: true }, true).map((i) => i.type))
      .toEqual(['subject_missing', 'subject_covers_text']);
    // sem foto, as flags são ignoradas
    expect(findTemplateTextIssues(plan, { texts: ['VAGAS'], subject_visible: false }, false)).toEqual([]);
  });

  it('sem foto o prompt é réplica exata; com foto libera reorganizar e leva o pedido sobre a pessoa', () => {
    const plan: TemplatePlan = {
      ...base,
      blocks: [{ position: 'faixa', original: 'GV Uniformes', kind: 'specific', style: '', new_text: 'MotorJarbs' }],
      subject_direction: 'jaqueta de couro, óculos aviador, sério',
      subject_placement: 'pessoa à direita, card reduzido à esquerda',
    };
    const exact = buildTemplateGenerationPrompt(plan, []);
    expect(exact).toContain('trocando APENAS os textos');
    expect(exact).not.toContain('REORGANIZE');
    const withPhoto = buildTemplateGenerationPrompt(plan, [{ url: 'u', kind: 'equipe' }]);
    expect(withPhoto).toContain('REORGANIZE');
    expect(withPhoto).toContain('pessoa à direita, card reduzido à esquerda');
    expect(withPhoto).toContain('jaqueta de couro, óculos aviador, sério');
    expect(withPhoto).toContain('troque "GV Uniformes" por "MotorJarbs"');
  });

  it('análise com fotos pede o plano de encaixe e o pedido sobre a pessoa', () => {
    const prompt = buildTemplateAnalysisPrompt('vaga', {}, [{ url: 'u', kind: 'equipe' }]);
    expect(prompt).toContain('imagem 2 = pessoa');
    expect(prompt).toContain('subject_direction');
    expect(prompt).toContain('subject_placement');
  });
});
