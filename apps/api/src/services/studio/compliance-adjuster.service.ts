import { openrouterService } from '../llms/openrouter.service.js';
import { StudioRepository } from '../../repository/studio.repository.js';
import { PlannerRepository } from '../../repository/planner.repository.js';
import { getComplianceQueue } from '../../lib/queue.js';

export const MAX_COMPLIANCE_ATTEMPTS = 5;

type AdjustmentContext = {
  creativeAssetId: string;
  tenantId: string;
  originalPrompt?: string;
};

/** Pega o prompt original da imagem: prefixo `original_prompt` no notes OU imagePrompt do post do planner. */
function extractOriginalPrompt(notes: string | null | undefined, postPrompt?: string | null): string {
  const fromNotes = notes?.match(/original_prompt="([^"]*)"/)?.[1];
  if (fromNotes) return fromNotes;
  return postPrompt ?? '';
}

/** Issues da última recusa (bloco `data={...}` do notes). */
function extractIssues(notes: string | null | undefined): string[] {
  try {
    const match = notes?.match(/data=(\{[\s\S]*\})/);
    if (match) {
      const parsed = JSON.parse(match[1]) as { issues?: unknown[] };
      if (Array.isArray(parsed.issues)) return parsed.issues.map(String);
    }
  } catch { /* segue sem issues */ }
  return [];
}

/**
 * Reescreve o prompt de imagem a partir dos motivos da recusa (LLM, com
 * fallback determinístico). Resultado usado para REGERAR a imagem.
 */
export async function buildAdjustmentPrompt(originalPrompt: string, issues: string[]): Promise<string> {
  const issueText = issues.join('; ');
  const system =
    'Você é especialista em anúncios Meta. Reescreva o prompt de geração de imagem para CORRIGIR os motivos de reprovação, MANTENDO o mesmo assunto/produto/tom da imagem. Regras: nada de logotipos de outras marcas/empresas; se houver texto, sempre em português e legível (nunca alucinado/gibberish/glifos quebrados). Retorne APENAS o prompt reescrito, sem aspas, sem introdução.';
  const user = `Prompt original: "${originalPrompt}"\nMotivos da reprovação: ${issueText}`;
  try {
    const out = await openrouterService.chat(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { model: 'deepseek/deepseek-chat', max_tokens: 600, temperature: 0.7 },
    );
    const rewritten = out?.trim();
    if (rewritten && rewritten.length > 20) return rewritten;
  } catch { /* fallback abaixo */ }
  return `${originalPrompt}. SEM logotipos de outras empresas. Correções obrigatórias: ${issueText}. Se houver texto, sempre em português e legível (nunca alucinado).`;
}

/**
 * Auto-ajuste: quando o compliance reprova uma imagem gerada por IA, reescreve
 * o prompt com os motivos da recusa e REGENERA a imagem (até 5x).
 * - NÃO desconta cota de criativos (só a 1ª geração desconta).
 * - NÃO aplica logoUrl do brand kit nas tentativas (causa comum de recusa).
 * - Patcheia o MESMO asset (o polling da UI re-analisa o mesmo id).
 */
export const complianceAdjuster = {
  async handleRejected(ctx: AdjustmentContext): Promise<void> {
    const { creativeAssetId, tenantId } = ctx;
    const repo = new StudioRepository(tenantId);
    const asset = await repo.findAssetById(creativeAssetId);
    if (!asset) return;
    if ((asset.complianceAttempts ?? 0) >= MAX_COMPLIANCE_ATTEMPTS) return; // badge final já visível na UI

    // 1) Prompt fonte: planner (post.imagePrompt) ou estúdio (original_prompt preservado no notes)
    let post: { id: string; imagePrompt: string | null } | null | undefined;
    try {
      post = await new PlannerRepository(tenantId).findPostByImageUrl(asset.url);
    } catch { post = null; }
    const originalPrompt = ctx.originalPrompt ?? extractOriginalPrompt(asset.complianceNotes, post?.imagePrompt);
    if (!originalPrompt) return; // sem prompt recuperável (ex.: render-creative) → ajuste manual

    const issues = extractIssues(asset.complianceNotes);

    // 2) Novo prompt + nova imagem (SEM logoUrl, SEM cota)
    const newPrompt = await buildAdjustmentPrompt(originalPrompt, issues);
    const generated = await openrouterService.generateImage({
      model: 'black-forest-labs/flux.2-pro',
      prompt: newPrompt,
    });
    const newUrl = generated.startsWith('http') || generated.startsWith('data:')
      ? generated
      : `data:image/png;base64,${generated}`;

    // 3) Patcheia o MESMO asset e re-enfileira compliance
    const attempts = (asset.complianceAttempts ?? 0) + 1;
    await repo.patchAsset(creativeAssetId, {
      url: newUrl,
      complianceStatus: 'pending_compliance',
      complianceAttempts: attempts,
      complianceNotes: JSON.stringify({ prompt: newPrompt, autoAdjustAttempt: attempts, previousNotes: asset.complianceNotes ?? null }),
    });

    // 4) Post do planner passa a apontar para a nova imagem
    if (post) {
      try {
        await new PlannerRepository(tenantId).updatePostImage(post.id, newUrl);
      } catch (err) {
        console.warn('[compliance-adjuster] falha ao atualizar imagem do post:', err instanceof Error ? err.message : err);
      }
    }

    const queue = await getComplianceQueue();
    await queue.add(
      'compliance-check',
      { creativeAssetId, tenantId },
      { removeOnComplete: 1000, removeOnFail: 5000, attempts: 4, backoff: { type: 'exponential', delay: 10_000 } },
    );
  },
};