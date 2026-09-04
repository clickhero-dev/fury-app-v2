export type ComplianceParsed = {
  approved: boolean | null;
  issues: string[];
  textPercentage: number | null;
};

export type ComplianceBadgeInfo = {
  label: string;
  tone: 'approved' | 'pending' | 'rejected' | 'unknown';
  reasons: string[];
};

/** Extrai {approved, issues, text_percentage} do compliance_notes (formato `data={json}` do worker). */
export function parseComplianceNotes(notes: string | null | undefined): ComplianceParsed {
  if (!notes) {
    return { approved: null, issues: [], textPercentage: null };
  }

  const jsonMatch = notes.match(/data=(\{[\s\S]*\})/) || notes.match(/\{[\s\S]*\}$/);
  const rawJson = jsonMatch ? jsonMatch[1] || jsonMatch[0] : null;

  if (!rawJson) {
    return { approved: null, issues: [notes], textPercentage: null };
  }

  try {
    const parsed = JSON.parse(rawJson) as {
      approved?: boolean;
      issues?: unknown;
      text_percentage?: unknown;
    };

    const hasComplianceFields =
      Object.prototype.hasOwnProperty.call(parsed, 'approved') ||
      Object.prototype.hasOwnProperty.call(parsed, 'issues') ||
      Object.prototype.hasOwnProperty.call(parsed, 'text_percentage');

    if (!hasComplianceFields) {
      return { approved: null, issues: [], textPercentage: null };
    }

    return {
      approved: typeof parsed.approved === 'boolean' ? parsed.approved : null,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map((issue) => String(issue)) : [],
      textPercentage:
        parsed.text_percentage === undefined || parsed.text_percentage === null
          ? null
          : Number(parsed.text_percentage),
    };
  } catch {
    return { approved: null, issues: [notes], textPercentage: null };
  }
}

/** Resumo visual do compliance para cards/badges: label + tom + motivos legíveis. */
export function complianceBadge(
  complianceStatus: string | null | undefined,
  notes?: string | null
): ComplianceBadgeInfo {
  const parsed = parseComplianceNotes(notes);

  if (complianceStatus === 'approved' || parsed.approved === true) {
    return { label: 'Aprovado', tone: 'approved', reasons: [] };
  }

  if (complianceStatus === 'rejected' || parsed.approved === false) {
    return {
      label: 'Reprovado pelo compliance',
      tone: 'rejected',
      reasons: parsed.issues,
    };
  }

  if (complianceStatus === 'pending_compliance' || complianceStatus === 'pending') {
    return { label: 'Analisando...', tone: 'pending', reasons: [] };
  }

  return { label: 'Sem análise', tone: 'unknown', reasons: [] };
}