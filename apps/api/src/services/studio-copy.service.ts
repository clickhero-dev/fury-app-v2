import { db, creativeAssets } from '@fury/db';
import { claude } from '../lib/claude.js';

type AdCopyInput = {
  objective?: string;
  product?: string;
  audience?: string;
  tone?: string;
  brandVoice?: string;
  quantity?: number;
};

function buildSystemPrompt() {
  return 'Você é copywriter especialista em Meta Ads.';
}

function buildUserPrompt(input: AdCopyInput) {
  const qty = input.quantity ?? 3;
  return `Você é copywriter especialista em Meta Ads. Gere ${qty} variações com o seguinte formato por item: {"headline":"...","primary_text":"...","cta":"...","reasoning":"..."}.\n\nObjetivo: ${input.objective || ''} | Produto: ${input.product || ''} | Público: ${input.audience || ''} | Tom: ${input.tone || ''} | BrandVoice: ${input.brandVoice || ''} \n\nRegras: Headline máximo 40 chars; Texto primário máximo 125 chars; CTA máximo 20 chars. Responda APENAS um JSON com um array no corpo principal, por exemplo: [{"headline":"...","primary_text":"...","cta":"...","reasoning":"..."}]`;
}

async function runTextComplianceCheck(text: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { approved: true, issues: [] };
  }

  const system = 'Você é um especialista em compliance de anúncios da Meta.';
  const user = `Analise este texto do anúncio e responda APENAS JSON: {"approved": boolean, "issues": string[]}. Texto: ${text}`;

  try {
    const response = await claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const content0 = (response as any)?.content?.[0];
    const textResp = (content0 && typeof content0 === 'object' && 'text' in content0) ? String((content0 as any).text) : String(content0 || '');
    const cleaned = textResp.replace(/```json|```/g, '').trim();
    let parsed: any = {};
    try {
      const match = cleaned.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : JSON.parse(cleaned);
    } catch (err) {
      return { approved: true, issues: ['compliance: parse_error'] };
    }

    return { approved: Boolean(parsed.approved), issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [] };
  } catch (err) {
    return { approved: true, issues: ['compliance: error_calling_api'] };
  }
}

export async function generateAdCopy(input: AdCopyInput, tenantId: string) {
  const qty = Math.min(Math.max(input.quantity ?? 3, 3), 5);

  // If no API key or mock, create simple mock variations
  if (!process.env.ANTHROPIC_API_KEY) {
    const mocked = Array.from({ length: qty }, (_, i) => ({
      id: null,
      headline: `${input.product || 'Produto'} - variação ${i + 1}`,
      primary_text: `Texto primário para ${input.product || 'produto'} direcionado a ${input.audience || 'público'}.`,
      cta: 'Saiba mais',
      reasoning: 'Fallback mock',
      compliance_status: 'approved',
    }));

    // persist mocks as assets
    const results = [] as any[];
    for (const v of mocked) {
      const payload = JSON.stringify({ headline: v.headline, primary_text: v.primary_text, cta: v.cta, reasoning: v.reasoning });
      const dataUrl = `data:application/json;base64,${Buffer.from(payload).toString('base64')}`;
      const [row] = await db.insert(creativeAssets).values({ tenantId, type: 'copy', url: dataUrl, complianceStatus: 'approved' }).returning();
      results.push({ id: row.id, headline: v.headline, primary_text: v.primary_text, cta: v.cta, compliance_status: 'approved' });
    }
    return { variations: results };
  }

  const system = buildSystemPrompt();
  const user = buildUserPrompt({ ...input, quantity: qty });

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const content0 = (response as any)?.content?.[0];
  const text = (content0 && typeof content0 === 'object' && 'text' in content0) ? String((content0 as any).text) : String(content0 || '');
  const cleaned = text.replace(/```json|```/g, '').trim();

  let parsed: any[] = [];
  try {
    // Try to parse either array or object wrapping array
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) parsed = JSON.parse(match[0]);
    else {
      const maybe = JSON.parse(cleaned);
      if (Array.isArray(maybe)) parsed = maybe; else if (Array.isArray(maybe?.variations)) parsed = maybe.variations;
    }
  } catch (err) {
    // fallback empty
    parsed = [];
  }

  const variations = parsed.slice(0, qty).map((v: any) => ({
    headline: String(v.headline || v.title || ''),
    primary_text: String(v.primary_text || v.text || v.body || ''),
    cta: String(v.cta || v.call_to_action || ''),
    reasoning: String(v.reasoning || ''),
  }));

  const results: any[] = [];
  for (const v of variations) {
    const combinedText = `${v.headline} ${v.primary_text} ${v.cta}`.trim();
    const compliance = await runTextComplianceCheck(combinedText);
    const status = compliance.approved ? 'approved' : 'rejected';
    const notes = JSON.stringify({ approved: compliance.approved, issues: compliance.issues });

    const payload = JSON.stringify({ headline: v.headline, primary_text: v.primary_text, cta: v.cta, reasoning: v.reasoning });
    const dataUrl = `data:application/json;base64,${Buffer.from(payload).toString('base64')}`;

    const [row] = await db.insert(creativeAssets).values({
      tenantId,
      type: 'copy',
      url: dataUrl,
      complianceStatus: status as any,
      complianceNotes: notes,
    }).returning();

    results.push({ id: row.id, headline: v.headline, primary_text: v.primary_text, cta: v.cta, compliance_status: status });
  }

  return { variations: results };
}

export const studioCopyService = { generateAdCopy };
