import OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import { db, creativeAssets, metaConnections } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';
import { complianceQueue, studioQueue, studioQueueEvents } from '../lib/queue.js';
import { saveTemporaryStudioImage } from '../lib/temp-storage.js';
import { decryptAccessToken, uploadAdImage } from '../lib/meta-api.js';

export type StudioImageFormat = 'feed' | 'stories' | 'banner';
export type StudioImageStyle = 'fotografico' | 'ilustracao' | 'minimalista';

export interface GenerateStudioImageInput {
  tenantId: string;
  briefing: string;
  format: StudioImageFormat;
  style: StudioImageStyle;
  adAccountId: string;
  publicBaseUrl: string;
}

export interface GenerateStudioImageResult {
  creativeAssetId: string;
  imageUrl: string;
  status: 'pending_compliance';
}

export interface StudioGenerationJobData extends GenerateStudioImageInput {}

function getImageSize(format: StudioImageFormat): '1024x1024' | '1024x1792' | '1792x1024' {
  switch (format) {
    case 'stories':
      return '1024x1792';
    case 'banner':
      return '1792x1024';
    case 'feed':
    default:
      return '1024x1024';
  }
}

function buildPrompt(briefing: string, style: StudioImageStyle, size: string): string {
  const styleDescription =
    style === 'fotografico'
      ? 'fotográfico realista'
      : style === 'ilustracao'
        ? 'ilustração vetorial moderna'
        : 'design minimalista limpo';

  return `Crie uma imagem publicitária profissional para uso em redes sociais brasileiras.

${briefing}.

Estilo: ${styleDescription}. Formato: ${size}.

A imagem deve ser limpa, com área para texto sobreposto, sem texto na imagem, cores vibrantes e atrativas, composição profissional de marketing digital.`;
}

function getMockResult(): GenerateStudioImageResult {
  return {
    creativeAssetId: 'mock_id',
    imageUrl: 'https://picsum.photos/1024/1024',
    status: 'pending_compliance',
  };
}

function getPublicStudioAssetUrl(publicBaseUrl: string, fileName: string): string {
  return new URL(`/studio-assets/${fileName}`, publicBaseUrl).toString();
}

async function generateRealStudioImage(
  input: GenerateStudioImageInput
): Promise<GenerateStudioImageResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const size = getImageSize(input.format);
  const prompt = buildPrompt(input.briefing, input.style, size);

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    size,
    quality: 'standard',
    n: 1,
  });

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) {
    throw new AppError(502, 'OPENAI_IMAGE_GENERATION_FAILED', 'Nao foi possivel gerar a imagem.');
  }

  const { fileName } = await saveTemporaryStudioImage(imageUrl);
  const publicImageUrl = getPublicStudioAssetUrl(input.publicBaseUrl, fileName);

  const [asset] = await db
    .insert(creativeAssets)
    .values({
      tenantId: input.tenantId,
      type: 'image',
      url: publicImageUrl,
      complianceStatus: 'pending_compliance' as any,
    })
    .returning();

  if (!asset) {
    throw new AppError(500, 'CREATIVE_ASSET_CREATE_FAILED', 'Nao foi possivel salvar o asset criativo.');
  }

  await complianceQueue.add('compliance-check', {
    creativeAssetId: asset.id,
    tenantId: input.tenantId,
  });

  return {
    creativeAssetId: asset.id,
    imageUrl: publicImageUrl,
    status: 'pending_compliance',
  };
}

export async function processStudioGenerationJob(
  input: StudioGenerationJobData
): Promise<GenerateStudioImageResult> {
  if (!process.env.OPENAI_API_KEY) {
    return getMockResult();
  }

  return generateRealStudioImage(input);
}

export async function requestStudioImageGeneration(
  input: GenerateStudioImageInput
): Promise<GenerateStudioImageResult> {
  if (!process.env.OPENAI_API_KEY) {
    return getMockResult();
  }

  const job = await studioQueue.add('generate-image', input);
  const result = await job.waitUntilFinished(studioQueueEvents);
  return result as GenerateStudioImageResult;
}

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
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexao Meta encontrada para este tenant.');
  }

  const adAccounts = (metaConn.adAccounts as { id: string }[]) || [];
  const accountExists = adAccounts.some((acc) => acc.id === params.adAccountId);

  if (!accountExists) {
    throw new AppError(403, 'AD_ACCOUNT_NOT_FOUND', 'Conta de anuncio nao pertence a este tenant.');
  }

  const accessToken = decryptAccessToken(metaConn.accessToken);

  let imageResponse: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

    try {
      imageResponse = await fetch(asset.url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const isTimeoutError = err instanceof DOMException && err.name === 'AbortError';
    const message = isTimeoutError
      ? 'Timeout ao baixar a imagem do asset (limite: 30s).'
      : 'Nao foi possivel baixar a imagem do asset.';
    throw new AppError(502, 'IMAGE_DOWNLOAD_FAILED', message);
  }

  if (!imageResponse.ok) {
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
  const urlObj = new URL(asset.url);
  const filename = urlObj.pathname.split('/').pop() || 'image.jpg';

  let metaAssetId: string;
  try {
    metaAssetId = await uploadAdImage({
      adAccountId: params.adAccountId,
      base64,
      filename,
      accessToken,
    });
  } catch (err) {
    const metaCode = (err as any).metaCode;

    if (metaCode === 190) {
      throw new AppError(
        401,
        'META_TOKEN_EXPIRED',
        'Token Meta expirado. Reconecte sua conta em Configuracoes > Integracoes.'
      );
    }

    throw err;
  }

  await db
    .update(creativeAssets)
    .set({ metaAssetId, complianceStatus: 'approved' })
    .where(eq(creativeAssets.id, params.creativeAssetId));

  return { metaAssetId };
}