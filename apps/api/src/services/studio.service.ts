import { and, count, desc, eq, or, type SQL } from 'drizzle-orm';
import OpenAI from 'openai';
import { db, creativeAssets, metaConnections } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';
import { getComplianceQueue } from '../lib/queue.js';
import { uploadAdImage } from '../lib/meta-api.js';
import { decryptMetaToken } from '../utils/crypto.js';
import { saveTemporaryStudioImage } from '../lib/temp-storage.js';

const CHAR_LIMITS = {
  headline: 40,
  descricao: 125,
  cta: 20,
  completo: 300,
} as const;
export type StudioGenerationJobData = {
  tenantId: string;
  briefing: string;
  format: 'feed' | 'stories' | 'banner';
  style: 'fotografico' | 'ilustracao' | 'minimalista';
  adAccountId: string;
  publicBaseUrl: string;
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
  const imageUrl = `${normalizePublicBaseUrl(input.publicBaseUrl)}/studio-assets/${fileName}`;

  const [asset] = await db
    .insert(creativeAssets)
    .values({
      tenantId: input.tenantId,
      type: 'image',
      url: imageUrl,
      complianceStatus: 'pending_compliance',
    })
    .returning();

  const complianceQueue = await getComplianceQueue();
  await complianceQueue.add('compliance-check', { creativeAssetId: asset.id, tenantId: input.tenantId }, {
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });

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

export async function processStudioGenerationJob(input: StudioGenerationJobData): Promise<GenerateStudioImageResult> {
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
};

const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 30000;

export async function uploadCreativeAssetToMeta(params: {
  tenantId: string;
  creativeAssetId: string;
  adAccountId: string;
}): Promise<{ metaAssetId: string }> {
  const asset = await db.query.creativeAssets.findFirst({
    where: eq(creativeAssets.id, params.creativeAssetId),
  });

  if (!asset) {
    throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo nao encontrado.');
  }

  if (asset.tenantId !== params.tenantId) {
    throw new AppError(403, 'FORBIDDEN', 'Este asset nao pertence ao seu tenant.');
  }

  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, params.tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

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

  await db
    .update(creativeAssets)
    .set({ metaAssetId, complianceStatus: 'approved' })
    .where(eq(creativeAssets.id, params.creativeAssetId));

  return { metaAssetId };
}

export async function deleteStudioAsset(params: { tenantId: string; assetId: string }): Promise<void> {
  const asset = await db.query.creativeAssets.findFirst({
    where: and(eq(creativeAssets.id, params.assetId), eq(creativeAssets.tenantId, params.tenantId)),
  });

  if (!asset) {
    throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo nao encontrado.');
  }

  await db.delete(creativeAssets).where(eq(creativeAssets.id, params.assetId));
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
  const { tenantId, type, status, page, limit } = params;
  const offset = (page - 1) * limit;

  const clauses: SQL[] = [eq(creativeAssets.tenantId, tenantId)];
  if (type) {
    clauses.push(eq(creativeAssets.type, type));
  }
  if (status === 'pending') {
    clauses.push(
      or(
        eq(creativeAssets.complianceStatus, 'pending'),
        eq(creativeAssets.complianceStatus, 'pending_compliance'),
      )!,
    );
  } else if (status) {
    clauses.push(eq(creativeAssets.complianceStatus, status));
  }

  const whereClause = and(...clauses);

  const [countRow] = await db
    .select({ total: count() })
    .from(creativeAssets)
    .where(whereClause);

  const rows = await db.query.creativeAssets.findMany({
    where: whereClause,
    orderBy: [desc(creativeAssets.createdAt)],
    limit,
    offset,
  });

  const total = Number((countRow as any)?.total ?? 0);
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
      ...extractCreativeCopyFromComplianceNotes(r.complianceNotes ?? null),
    })),
    total,
    page,
    totalPages,
  };
}
