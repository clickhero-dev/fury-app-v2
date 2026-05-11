import OpenAI from 'openai';
import { db, creativeAssets } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';
import { complianceQueue, studioQueue, studioQueueEvents } from '../lib/queue.js';
import { saveTemporaryStudioImage } from '../lib/temp-storage.js';

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