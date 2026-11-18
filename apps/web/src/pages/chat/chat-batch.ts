import { z } from 'zod';
import { chatRequest } from './chat-request';
import { approvalFailureFromResult } from './approval-outcomes';
import type { BatchItemResult, BatchReview } from './ReviewBatch';
import { batchDetails, batchAdvancedDetails, batchMedia } from './batch-presentation';
export { batchDetails } from './batch-presentation';

const impactSchema = z.object({ known: z.boolean(), value: z.unknown() });
const quotaUnitsSchema = z.object({ unit: z.enum(['image', 'video']), amount: z.literal(1) });
const reviewSchema = z.object({
  reviewToken: z.string().uuid(), version: z.number().int().positive(), digest: z.string().regex(/^[a-f0-9]{64}$/),
  approvalIds: z.array(z.string()).min(1).max(10), expiresAt: z.string().datetime({ offset: true }),
  items: z.array(z.object({
    id: z.string(), method: z.enum(['POST', 'PATCH']), path: z.string(), parameters: z.record(z.unknown()),
    expiresAt: z.string().datetime({ offset: true }), cost: impactSchema, quota: impactSchema,
  })).min(1).max(10),
});
const confirmationSchema = z.object({
  approvalIds: z.array(z.string()).min(1).max(10), reviewToken: z.string().uuid(),
  version: z.number().int().positive(), digest: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string().datetime({ offset: true }), conversationId: z.string(),
});
const resultsSchema = z.object({
  partialFailure: z.boolean(),
  items: z.array(z.object({
    id: z.string(), status: z.enum(['completed', 'processing', 'failed', 'unknown']),
    result: z.record(z.unknown()).nullable().optional(),
  })),
});
const actionLabels: Record<string, [string, string]> = {
  'POST /api/studio/ai/generate-image': ['Criar imagem', 'Gera uma imagem; não publica.'],
  'POST /api/studio/video/jobs': ['Criar vídeo', 'Inicia a geração de um vídeo; não publica.'],
  'POST /api/planner/posts': ['Agendar publicação', 'Cria uma publicação conforme os canais e a data revisados.'],
  'POST /api/campaigns/create': ['Criar campanha', 'Cria uma campanha na conta de anúncios revisada.'],
  'POST /api/studio/ai/chat-edit': ['Editar imagem', 'Gera uma edição da imagem; não publica.'],
  'PATCH /api/brand-kit/chat-update': ['Atualizar marca', 'Altera os dados da marca revisados.'],
  'PATCH /api/auth/me/chat-update': ['Atualizar perfil', 'Altera os dados do perfil revisados.'],
};
export function batchActionLabel(method: string, path: string): [string, string] | null {
  const fixed = actionLabels[`${method} ${path}`];
  if (fixed) return fixed;
  const id = '[0-9a-f-]{36}';
  if (method === 'POST' && new RegExp(`^/api/studio/video/assets/${id}/chat-adjust$`).test(path)) return ['Ajustar vídeo', 'Inicia uma nova versão do vídeo; não publica.'];
  if (method === 'POST' && new RegExp(`^/api/campaigns/${id}/chat-ads-create$`).test(path)) return ['Criar anúncio', 'Cria um anúncio na campanha revisada.'];
  if (method === 'PATCH' && new RegExp(`^/api/planner/posts/${id}/chat-cancel$`).test(path)) return ['Cancelar publicação', 'Cancela a publicação agendada revisada.'];
  if (method === 'PATCH' && new RegExp(`^/api/campaigns/${id}/chat-(?:update|ads/[0-9]{1,32})$`).test(path)) return ['Atualizar campanha ou anúncio', 'Altera somente os campos revisados da campanha ou anúncio.'];
  return null;
}
function impactText(label: string, impact: z.infer<typeof impactSchema>) {
  const units = quotaUnitsSchema.safeParse(impact.value);
  if (label === 'Cota' && impact.known && units.success) return `Consome 1 ${units.data.unit === 'image' ? 'imagem' : 'vídeo'}`;
  const known = impact.known && ['string', 'number'].includes(typeof impact.value);
  return known ? `${label}: ${String(impact.value)}` : `${label} não informado`;
}
function safeEvidence(result: Record<string, unknown> | null | undefined): BatchItemResult['evidence'] {
  if (!result) return {};
  const failure = approvalFailureFromResult('failed', result);
  return {
    ...Object.fromEntries(['imageUrl', 'videoUrl'].flatMap(key =>
      typeof result[key] === 'string' && /^https:\/\//i.test(result[key] as string) ? [[key, result[key]]] : [])),
    ...(typeof result.jobId === 'string' && result.jobId.length <= 128 ? {jobId: result.jobId} : {}),
    ...(failure ? {code: failure.code, error: failure.message} : {}),
  };
}
export async function reviewBatch(conversationId: string, approvalIds: string[]): Promise<BatchReview> {
  const data = reviewSchema.parse(await (await chatRequest(`/conversations/${encodeURIComponent(conversationId)}/approvals/review`, {
    method: 'POST', body: JSON.stringify({ approvalIds }),
  })).json());
  if (new Set(approvalIds).size !== approvalIds.length || JSON.stringify(data.approvalIds) !== JSON.stringify(approvalIds)
    || JSON.stringify(data.items.map(item => item.id)) !== JSON.stringify(approvalIds)
    || Date.parse(data.expiresAt) <= Date.now()) throw new Error('Invalid review scope');
  const { reviewToken, version, digest, expiresAt } = data;
  return {
    token: JSON.stringify({ approvalIds, reviewToken, version, digest, expiresAt, conversationId }),
    consumptionSummary: data.items.reduce((summary,item) => {
      const units=quotaUnitsSchema.safeParse(item.quota.value);
      return item.quota.known && units.success
        ? {...summary,[units.data.unit]:summary[units.data.unit] + units.data.amount}
        : {...summary,unknownItems:summary.unknownItems + 1};
    },{image:0,video:0,unknownItems:0}),
    items: data.items.map(item => {
      const label = batchActionLabel(item.method, item.path);
      if (!label) throw new Error('Unsupported reviewed action');
      return { id: item.id, title: label[0], details: batchDetails(item.parameters),
        advancedDetails: batchAdvancedDetails(item.parameters), media: batchMedia(item.parameters),
        effect: label[1], quota: `${impactText('Custo', item.cost)} · ${impactText('Cota', item.quota)}` };
    }),
  };
}
export async function confirmBatch(conversationId: string, snapshot: BatchReview): Promise<BatchItemResult[]> {
  const data = confirmationSchema.parse(JSON.parse(snapshot.token));
  if (data.conversationId !== conversationId || Date.parse(data.expiresAt) <= Date.now()
    || JSON.stringify(data.approvalIds) !== JSON.stringify(snapshot.items.map(item => item.id))) throw new Error('Invalid review');
  const { approvalIds, reviewToken, version, digest } = data;
  const response = resultsSchema.parse(await (await chatRequest(`/conversations/${encodeURIComponent(conversationId)}/approvals/confirm-batch`, {
    method: 'POST', body: JSON.stringify({ approvalIds, reviewToken, version, digest }),
  })).json());
  if (response.items.some(item => !approvalIds.includes(item.id))) throw new Error('Invalid result scope');
  return response.items.map(item => ({
    id: item.id, status: item.status === 'unknown' ? 'uncertain' : item.status === 'processing' ? 'pending' : item.status,
    evidence: safeEvidence(item.result),
    message: item.status === 'completed' ? 'Ação concluída.' : item.status === 'processing' ? 'Ação em andamento; resultado ainda não concluído.'
      : item.status === 'failed' ? approvalFailureFromResult('failed', item.result ?? undefined)?.message ?? 'Não foi possível executar esta ação. Confira os dados antes de criar outra proposta.'
        : 'Resultado não confirmado. Verifique o status antes de qualquer nova tentativa.',
  }));
}
