export type BrandKitInfo = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  voiceTone?: string | null;
};

export type CompliancePromptParams = {
  promptOriginal?: string | null;
  brandKit?: BrandKitInfo | null;
};

/**
 * Monta o prompt de análise de compliance da imagem com contexto:
 * critérios base + parece-ads-para-Facebook/Instagram (Canvas) + fidelidade
 * ao prompt original de criação + conformidade com o brand kit (cores/tom).
 */
export function buildComplianceUserPrompt(params: CompliancePromptParams = {}): string {
  const lines = [
    'Analise esta imagem de anúncio. Identifique:',
    '1) Texto proibido pelo Meta',
    '2) Conteúdo enganoso',
    '3) Texto bugado: caracteres ilegíveis, gibberish, glifos quebrados ou texto em idioma que não seja o português',
    '4) Qualidade de anúncio: a imagem parece um anúncio profissional criado para Facebook/Instagram, como os feitos no Meta Ads Canvas?',
  ];

  if (params.promptOriginal?.trim()) {
    lines.push(
      `5) Fidelidade ao prompt original: "${params.promptOriginal.trim()}" — a imagem obedece fielmente a este prompt de criação?`
    );
  }

  const bk = params.brandKit;
  if (bk && (bk.primaryColor || bk.secondaryColor || bk.voiceTone)) {
    const parts: string[] = [];
    if (bk.primaryColor) parts.push(`cor primária ${bk.primaryColor}`);
    if (bk.secondaryColor) parts.push(`cor secundária ${bk.secondaryColor}`);
    if (bk.voiceTone) parts.push(`tom de voz ${bk.voiceTone}`);
    lines.push(`6) Brand kit: a imagem respeita o brand kit da empresa (${parts.join(', ')})?`);
  }

  lines.push('Responda APENAS JSON: {"approved": boolean, "issues": string[], "text_percentage": number}');

  return lines.join(' ');
}