import { describe, expect, it } from 'vitest';
import { parseComplianceNotes, complianceBadge } from './compliance.utils';

const REJECTED_NOTES =
  '[COMPLIANCE] approved=false | text_percentage=30 | issues=Texto proibido. ; Conteúdo enganoso. | ' +
  'data={"approved":false,"issues":["Texto proibido na imagem.","Logotipo de odontologia em anúncio de padaria."],"text_percentage":30}';

describe('parseComplianceNotes', () => {
  it('extrai approved/issues/text_percentage do formato do worker', () => {
    const parsed = parseComplianceNotes(REJECTED_NOTES);
    expect(parsed).toEqual({
      approved: false,
      issues: ['Texto proibido na imagem.', 'Logotipo de odontologia em anúncio de padaria.'],
      textPercentage: 30,
    });
  });

  it('retorna vazio para notes nulos', () => {
    expect(parseComplianceNotes(null)).toEqual({ approved: null, issues: [], textPercentage: null });
  });

  it('retorna issues com o texto bruto quando não há JSON parseável', () => {
    const parsed = parseComplianceNotes('nota sem json');
    expect(parsed.approved).toBeNull();
    expect(parsed.issues).toEqual(['nota sem json']);
  });
});

describe('complianceBadge', () => {
  it('reprovado → label + motivos legíveis', () => {
    const badge = complianceBadge('rejected', REJECTED_NOTES);
    expect(badge.label).toBe('Reprovado pelo compliance');
    expect(badge.tone).toBe('rejected');
    expect(badge.reasons).toContain('Logotipo de odontologia em anúncio de padaria.');
    expect(badge.reasons).toContain('Texto proibido na imagem.');
  });

  it('aprovado → sem motivos', () => {
    const badge = complianceBadge('approved', '[COMPLIANCE] approved=true | data={"approved":true,"issues":[],"text_percentage":5}');
    expect(badge.label).toBe('Aprovado');
    expect(badge.tone).toBe('approved');
    expect(badge.reasons).toEqual([]);
  });

  it('pendente → Analisando', () => {
    expect(complianceBadge('pending_compliance', null)).toMatchObject({ label: 'Analisando...', tone: 'pending' });
  });
});