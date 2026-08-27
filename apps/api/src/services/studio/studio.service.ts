import OpenAI from 'openai';
import { AppError } from '../../middleware/errorHandler.js';
import { getComplianceQueue } from '../../lib/queue.js';
import { uploadAdImage } from '../../lib/meta-api.js';
import { decryptMetaToken } from '../../utils/crypto.js';
import { saveTemporaryStudioImage } from '../../lib/temp-storage.js';
import { uploadAsset } from '../storage/storage.service.js';
import { openrouterService } from '../llms/openrouter.service.js';
import { generateId } from '../../agents/utils.js';
import type { PlannerPrompt } from '../../agents/types.js';
import { checkAndCompletePlannerJob } from '../planner/planner-studio.service.js';
import { StudioRepository } from '../../repository/studio.repository.js';
import { PlannerRepository } from '../../repository/planner.repository.js';

const CHAR_LIMITS = {
  headline: 40,
  descricao: 125,
  cta: 20,
  completo: 300,
} as const;
export type StudioGenerationJobData = {
  tenantId: string;
  briefing?: string;
  format?: 'feed' | 'stories' | 'banner';
  style?: 'fotografico' | 'ilustracao' | 'minimalista';
  adAccountId?: string;
  publicBaseUrl?: string;
  // Modo planner (fluxo do planejador de conteúdo) — quando presente, o worker
  // gera a imagem real e grava o social_post no calendário.
  mode?: 'planner';
  planId?: string;
  post?: PlannerPrompt;
  logoUrl?: string;
};

export type GenerateStudioImageResult = {
  creativeAssetId: string;
  imageUrl: string;
  status: 'pending_compliance';
};
const STUDIO_PLACEHOLDER_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9mH9kAAAAASUVORK5CYII=';

function normalizePublicBaseUrl(publicBaseUrl: string) {
  return publicBaseUrl.replace(/\/+$/, '');
}

async function persistStudioImage(input: StudioGenerationJobData): Promise<GenerateStudioImageResult> {
  const { fileName } = await saveTemporaryStudioImage(STUDIO_PLACEHOLDER_PNG);
  const imageUrl = `${normalizePublicBaseUrl(input.publicBaseUrl ?? '')}/studio-assets/${fileName}`;

  const repo = new StudioRepository(input.tenantId);
  const asset = await repo.createAsset({
    tenantId: input.tenantId,
    type: 'image',
    url: imageUrl,
    complianceStatus: 'pending_compliance',
  });

  // Enfileira compliance check com retry
  const complianceQueue = await getComplianceQueue();
  let complianceEnqueued = false;
  let retries = 3;
  while (!complianceEnqueued && retries > 0) {
    try {
      await complianceQueue.add('compliance-check', { creativeAssetId: asset.id, tenantId: input.tenantId }, {
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      complianceEnqueued = true;
    } catch (err) {
      retries--;
      if (retries === 0) {
        // Rollback: deletar creativeAsset criado se compliance queue falhar definitivamente
        await repo.deleteAsset(asset.id);
        throw err;
      }
      await new Promise(r => setTimeout(r, 1000 * (4 - retries))); // backoff: 1s, 2s, 3s
    }
  }

  return {
    creativeAssetId: asset.id,
    imageUrl,
    status: 'pending_compliance',
  };
}

function calcularPontuacao(texto: string, type: keyof typeof CHAR_LIMITS) {
  let pontuacao = 3;
  if (texto.length <= CHAR_LIMITS[type]) {
    pontuacao += 3;
  }

  const ctaKeywords = ['compre', 'acesse', 'saiba', 'clique', 'garanta'];
  if (ctaKeywords.some((keyword) => texto.toLowerCase().includes(keyword))) {
    pontuacao += 2;
  }

  const forbiddenKeywords = ['grátis', 'garantido 100%', 'melhor do mundo'];
  if (!forbiddenKeywords.some((keyword) => texto.toLowerCase().includes(keyword))) {
    pontuacao += 2;
  }

  return Math.min(Math.max(pontuacao, 0), 10);
}

function buildMockVariations(input: any) {
  const templates = [
    `${input.produto} — transforme seu negócio hoje!`,
    `Descubra ${input.produto} para ${input.publico}`,
    `A melhor escolha em ${input.produto}`,
    `Clique e conheça ${input.produto}`,
    `Garanta ${input.produto} agora mesmo`,
  ];

  const quantidade = Math.min(Math.max(input.quantidadeVariacoes || 3, 3), 5);
  return Array.from({ length: quantidade }, (_, index) => {
    const texto = templates[index % templates.length];
    return {
      texto,
      caracteres: texto.length,
      pontuacao: calcularPontuacao(texto, input.type),
    };
  });
}

function buildSystemPrompt() {
  return 'Você é um especialista em copywriting para anúncios digitais no Facebook e Instagram.\n\nGere variações de copy persuasivas, claras e em português brasileiro adequadas para o público-alvo.\n\nRespeite RIGOROSAMENTE os limites de caracteres especificados.\n\nResponda APENAS em JSON válido, sem texto adicional, sem markdown.';
}

function buildUserPrompt(input: any) {
  const limiteChars = {
    headline: 40,
    descricao: 125,
    cta: 20,
    completo: 300,
  } as const;
  return `Produto/serviço: ${input.produto}\n\nPúblico-alvo: ${input.publico}\n\nObjetivo do anúncio: ${input.objetivo}\n\nTom de comunicação: ${input.tom}\n\nGere ${input.quantidadeVariacoes} variações de ${input.type} em português brasileiro.\n\nLimite máximo: ${(limiteChars as any)[input.type]} caracteres por variação.\n\nRetorne APENAS este JSON:\n\n{\n  "variacoes": [\n    { "texto": "texto da variação aqui", "caracteres": 0 }\n  ]\n}`;
}

export async function generateCopy(input: any) {
  if (!process.env.OPENAI_API_KEY || process.env.META_USE_MOCK === 'true') {
    return { variacoes: buildMockVariations(input) };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const chatResponse = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1000,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) },
    ],
  });

  const responseText = chatResponse.choices[0]?.message?.content ?? '';
  const cleaned = responseText.replace(/```json|```/g, '').trim();

  let parsed: any = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { variacoes: buildMockVariations(input) };
  }

  if (!parsed?.variacoes?.length) {
    return { variacoes: buildMockVariations(input) };
  }

  const variacoes = parsed.variacoes.map((variacao: any) => {
    const texto = String(variacao.texto ?? variacao.text ?? '');
    return {
      texto,
      caracteres: texto.length,
      pontuacao: calcularPontuacao(texto, input.type),
    };
  });

  return { variacoes: variacoes.slice(0, Math.min(Math.max(input.quantidadeVariacoes, 3), 5)) };
}

export async function requestStudioImageGeneration(input: StudioGenerationJobData): Promise<GenerateStudioImageResult> {
  if (!input) {
    return { message: 'Rota de imagem ativa' } as any;
  }
  const result = await persistStudioImage(input);
  return {
    message: 'Imagem gerada e enviada para compliance',
    ...result,
  } as any;
}

// ─── Modo planner (planejador de conteúdo) ─────────────────────────────────────
const PLANNER_IMAGE_MODEL = process.env.PLANNER_IMAGE_MODEL ?? 'black-forest-labs/flux.2-klein-4b';

/** Aspect ratio (FLUX-compatível) por tipo de post do planner. */
export function aspectForPlannerPostType(postType: PlannerPrompt['postType']): string {
  return postType === 'reel' || postType === 'stories' ? '9:16' : '1:1';
}

const VALID_POST_TYPES = ['image', 'carousel', 'reel', 'stories'] as const;
const VALID_PLATFORMS = ['instagram', 'facebook', 'both'] as const;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normaliza um post do planner antes do insert no calendário.
 * Garante data YYYY-MM-DD válida (fallback: amanhã UTC), enums válidos e
 * arrays/hashes corretos — o insert em socialPosts NUNCA quebra por shape.
 */
export function normalizePlannerPost(post: PlannerPrompt): PlannerPrompt {
  const date =
    ISO_DATE_RE.test(post.date) && !Number.isNaN(new Date(`${post.date}T00:00:00Z`).getTime())
      ? post.date
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const postType = VALID_POST_TYPES.includes(post.postType as (typeof VALID_POST_TYPES)[number])
    ? post.postType
    : 'image';

  const platform = VALID_PLATFORMS.includes(post.platform as (typeof VALID_PLATFORMS)[number])
    ? post.platform
    : 'instagram';

  const hashtags = Array.isArray(post.hashtags) ? post.hashtags.filter((h): h is string => typeof h === 'string') : [];

  return {
    date,
    title: typeof post.title === 'string' ? post.title : '',
    caption: typeof post.caption === 'string' ? post.caption : '',
    cta: typeof post.cta === 'string' ? post.cta : '',
    hashtags,
    imagePrompt: typeof post.imagePrompt === 'string' ? post.imagePrompt : '',
    postType,
    platform,
  };
}

/**
 * Etapa 2.5 do fluxo: gera a imagem real via OpenRouter/FLUX, persiste no R2 e
 * grava o social_post no calendário. Chamado pelo worker studio (modo planner)
 * quando a imagem é concluída.
 * IDEMPOTENTE: verifica se socialPost já existe para (planId, date, postType) antes de criar.
 */
export async function processPlannerImageJob(input: StudioGenerationJobData): Promise<GenerateStudioImageResult> {
  const rawPost = input.post;
  const planId = input.planId;
  if (!rawPost || !planId) {
    throw new AppError(400, 'PLANNER_IMAGE_MISSING_DATA', 'Job de imagem do planner sem post/planId.');
  }

  // Normaliza data/enums antes de qualquer query/insert (defensivo).
  const post = normalizePlannerPost(rawPost);
  const repo = new StudioRepository(input.tenantId);
  const plannerRepo = new PlannerRepository(input.tenantId);

  // IDEMPOTÊNCIA: Verificar se socialPost já foi criado para este post
  const existingPost = await plannerRepo.findPostByPlanDateType(planId, post.date, post.postType);

  if (existingPost) {
    // Job já processado com sucesso - retornar resultado existente
    const existingAsset = await repo.findAssetByUrl(existingPost.imageUrl ?? '');
    return {
      creativeAssetId: existingAsset?.id ?? '',
      imageUrl: existingPost.imageUrl ?? '',
      status: 'pending_compliance' as const,
    };
  }

  const base64 = await openrouterService.generateImage({
    model: PLANNER_IMAGE_MODEL,
    prompt: post.imagePrompt,
    aspect_ratio: aspectForPlannerPostType(post.postType),
    logoUrl: input.logoUrl,
  });

  const buffer = Buffer.from(base64.split(',')[1] ?? base64, 'base64');
  const fileName = `planner/${input.tenantId}/${planId}/${post.date}-${generateId()}.png`;
  const imageUrl = await uploadAsset(buffer, fileName, 'image/png');

  // 1) Cria o creativeAsset para aparecer na biblioteca do estúdio
  const creativeAsset = await repo.createAsset({
    tenantId: input.tenantId,
    type: 'image',
    url: imageUrl,
    complianceStatus: 'pending_compliance',
  });

  // Enfileira compliance check com retry
  const complianceQueue = await getComplianceQueue();
  let complianceEnqueued = false;
  let retries = 3;
  while (!complianceEnqueued && retries > 0) {
    try {
      await complianceQueue.add('compliance-check', { creativeAssetId: creativeAsset.id, tenantId: input.tenantId }, {
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      complianceEnqueued = true;
    } catch (err) {
      retries--;
      if (retries === 0) {
        // Rollback: deletar creativeAsset criado se compliance queue falhar definitivamente
        await repo.deleteAsset(creativeAsset.id);
        throw err;
      }
      await new Promise(r => setTimeout(r, 1000 * (4 - retries))); // backoff: 1s, 2s, 3s
    }
  }

  // 2) Grava o social_post no calendário referenciando o creativeAsset
  await plannerRepo.createPost({
    tenantId: input.tenantId,
    planId,
    platform: post.platform === 'both' ? 'instagram' : post.platform,
    postType: post.postType,
    title: post.title,
    caption: post.caption,
    cta: post.cta,
    hashtags: post.hashtags,
    imagePrompt: post.imagePrompt,
    imageUrl,
    dayIndex: new Date(`${post.date}T00:00:00Z`).getUTCDate(),
    calendarDate: post.date,
    scheduledAt: new Date(`${post.date}T12:00:00Z`),
    status: 'draft',
  });

  // Verificar se todos os posts do plano foram criados e completar o job do planner
  await checkAndCompletePlannerJob(planId, input.tenantId, 8); // 8 posts esperados por padrão

  return {
    creativeAssetId: String(creativeAsset.id),
    imageUrl,
    status: 'pending_compliance' as const,
  };
}

export async function processStudioGenerationJob(input: StudioGenerationJobData): Promise<GenerateStudioImageResult> {
  if (input?.mode === 'planner') {
    return processPlannerImageJob(input);
  }
  if (!input) {
    return { message: 'Job de imagem processado' } as any;
  }
  const result = await persistStudioImage(input);
  return {
    message: 'Job de imagem processado',
    ...result,
  } as any;
}

export const studioService = {
  generateCopy,
  requestStudioImageGeneration,
  processStudioGenerationJob,
  processPlannerImageJob,
};

const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 90000;

export async function uploadCreativeAssetToMeta(params: {
  tenantId: string;
  creativeAssetId: string;
  adAccountId: string;
}): Promise<{ metaAssetId: string }> {
  const repo = new StudioRepository(params.tenantId);
  const asset = await repo.findAssetById(params.creativeAssetId);

  if (!asset) {
    throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo nao encontrado.');
  }

  const metaConn = await repo.findLatestMetaConnection();

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexao Meta encontrada para este tenant.');
  }

  const adAccounts = (metaConn.adAccounts || []) as Array<{ id: string }>;
  const accountExists = adAccounts.some((account) => account.id === params.adAccountId);

  if (!accountExists) {
    throw new AppError(403, 'AD_ACCOUNT_NOT_FOUND', 'Conta de anuncio nao pertence ao seu tenant.');
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);

  let imageResponse: Response | undefined;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    try {
      imageResponse = await fetch((asset as any).url, { signal: controller.signal } as any);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err: any) {
    const isTimeoutError = err instanceof DOMException && err.name === 'AbortError';
    const message = isTimeoutError
      ? 'Timeout ao baixar a imagem do asset (limite: 30s).'
      : 'Nao foi possivel baixar a imagem do asset.';
    throw new AppError(502, 'IMAGE_DOWNLOAD_FAILED', message);
  }

  if (!imageResponse || !imageResponse.ok) {
    throw new AppError(502, 'IMAGE_DOWNLOAD_FAILED', 'Nao foi possivel baixar a imagem do asset.');
  }

  const contentType = imageResponse.headers.get('content-type') || '';
  const mimeType = contentType.split(';')[0]?.trim() ?? '';

  if (!VALID_IMAGE_TYPES.includes(mimeType)) {
    throw new AppError(400, 'INVALID_IMAGE_FORMAT', `Formato de imagem invalido: ${mimeType || 'desconhecido'}.`);
  }

  const arrayBuffer = await imageResponse.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError(400, 'IMAGE_TOO_LARGE', 'Imagem excede o tamanho maximo de 4MB.');
  }

  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const urlObj = new URL((asset as any).url);
  const filename = urlObj.pathname.split('/').pop() || 'image.jpg';

  let metaAssetId: string;
  try {
    metaAssetId = await uploadAdImage({
      adAccountId: params.adAccountId,
      base64,
      filename,
      accessToken,
    });
  } catch (err: any) {
    const metaCode = err.metaCode;
    if (metaCode === 190) {
      throw new AppError(401, 'META_TOKEN_EXPIRED', 'Token Meta expirado. Reconecte sua conta em Configuracoes > Integracoes.');
    }
    throw err;
  }

  await repo.patchAsset(params.creativeAssetId, { metaAssetId, complianceStatus: 'approved' });

  return { metaAssetId };
}

export async function deleteStudioAsset(params: { tenantId: string; assetId: string }): Promise<void> {
  const repo = new StudioRepository(params.tenantId);
  const asset = await repo.findAssetById(params.assetId);

  if (!asset) {
    throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo nao encontrado.');
  }

  await repo.deleteAsset(params.assetId);
}

export type StudioAssetListItem = {
  id: string;
  type: 'image' | 'video' | 'copy';
  url: string;
  complianceStatus: string;
  metaAssetId: string | null;
  createdAt: string;
  headline?: string;
  primaryText?: string;
  modificationsRemaining: number | null;
};

/**
 * Extrai headline/primary_text salvos no momento da geracao do criativo.
 * complianceNotes guarda metadados de geracao (ex: { headline, cta }) ate o
 * worker de compliance sobrescrever com o resultado da checagem
 * (ex: { approved, issues, text_percentage }) — nesse caso nao ha texto a extrair.
 */
function extractCreativeCopyFromComplianceNotes(complianceNotes: string | null): {
  headline?: string;
  primaryText?: string;
} {
  if (!complianceNotes) return {};

  try {
    const parsed = JSON.parse(complianceNotes) as Record<string, unknown>;

    const isComplianceResult =
      'approved' in parsed || 'issues' in parsed || 'text_percentage' in parsed;
    if (isComplianceResult) return {};

    const headline = typeof parsed.headline === 'string' ? parsed.headline : undefined;
    const primaryText = typeof parsed.primary_text === 'string' ? parsed.primary_text : undefined;

    return { headline, primaryText };
  } catch {
    return {};
  }
}

export async function listStudioAssetsForTenant(params: {
  tenantId: string;
  type?: 'image' | 'video' | 'copy';
  status?: 'pending' | 'approved' | 'rejected';
  page: number;
  limit: number;
}): Promise<{
  assets: StudioAssetListItem[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const { type, status, page, limit } = params;
  const repo = new StudioRepository(params.tenantId);
  const { rows, total, modificationsRemainingByRootId } = await repo.listAssets({ type, status, page, limit });

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    assets: rows.map((r: any) => ({
      id: r.id,
      type: r.type,
      url: r.url,
      complianceStatus: r.complianceStatus,
      complianceNotes: r.complianceNotes ?? null,
      metaAssetId: r.metaAssetId ?? null,
      createdAt: r.createdAt.toISOString(),
      modificationsRemaining: modificationsRemainingByRootId.get(r.rootAssetId ?? r.id) ?? null,
      ...extractCreativeCopyFromComplianceNotes(r.complianceNotes ?? null),
    })),
    total,
    page,
    totalPages,
  };
}
