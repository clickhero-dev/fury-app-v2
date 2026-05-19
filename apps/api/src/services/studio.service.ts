import { db, creativeAssets, metaConnections } from '@fury/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler.js';
import { complianceQueue } from '../lib/queue.js';
import { decryptAccessToken, uploadAdImage } from '../lib/meta-api.js';
import { saveTemporaryStudioImage } from '../lib/temp-storage.js';

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

function buildPlaceholderSourceUrl(
  briefing: string,
  format: StudioGenerationJobData['format'],
  style: StudioGenerationJobData['style']
): string {
  const text = `${style} • ${format} • ${briefing}`.slice(0, 160);
  return `https://placehold.co/1024x1024/png?text=${encodeURIComponent(text)}`;
}

export async function requestStudioImageGeneration(input: StudioGenerationJobData): Promise<GenerateStudioImageResult> {
  const sourceUrl = buildPlaceholderSourceUrl(input.briefing, input.format, input.style);
  const { fileName } = await saveTemporaryStudioImage(sourceUrl);
  const normalizedBaseUrl = input.publicBaseUrl.replace(/\/$/, '');
  const imageUrl = `${normalizedBaseUrl}/studio-assets/${fileName}`;

  const [asset] = await db
    .insert(creativeAssets)
    .values({
      tenantId: input.tenantId,
      type: 'image',
      url: imageUrl,
      complianceStatus: 'pending_compliance',
    })
    .returning();

  if (!asset) {
    throw new Error('Falha ao salvar creative_asset para compliance');
  }

  await complianceQueue.add(
    'compliance-check',
    {
      creativeAssetId: asset.id,
      tenantId: input.tenantId,
    },
    {
      jobId: asset.id,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  console.log(`[STUDIO] ✅ Creative asset ${asset.id} criado e enfileirado para compliance-check`);

  return {
    creativeAssetId: asset.id,
    imageUrl,
    status: 'pending_compliance',
  };
}

export async function processStudioGenerationJob(input: StudioGenerationJobData): Promise<GenerateStudioImageResult> {
  return requestStudioImageGeneration(input);
}

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

  const adAccounts = (metaConn.adAccounts || []) as Array<{ id: string }>;
  const accountExists = adAccounts.some((account) => account.id === params.adAccountId);

  if (!accountExists) {
    throw new AppError(403, 'AD_ACCOUNT_NOT_FOUND', 'Conta de anuncio nao pertence ao seu tenant.');
  }

  const accessToken = decryptAccessToken(metaConn.accessToken);

  const imageResponse = await fetch(asset.url);

  if (!imageResponse.ok) {
    throw new AppError(502, 'IMAGE_DOWNLOAD_FAILED', 'Nao foi possivel baixar a imagem do asset.');
  }

  const contentType = imageResponse.headers.get('content-type') || '';
  const mimeType = contentType.split(';')[0]?.trim() ?? '';

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new AppError(400, 'INVALID_IMAGE_FORMAT', `Formato de imagem invalido: ${mimeType || 'desconhecido'}.`);
  }

  const arrayBuffer = await imageResponse.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const filename = new URL(asset.url).pathname.split('/').pop() || 'image.png';

  const metaAssetId = await uploadAdImage({
    adAccountId: params.adAccountId,
    base64,
    filename,
    accessToken,
  });

  await db
    .update(creativeAssets)
    .set({ metaAssetId, complianceStatus: 'approved' })
    .where(eq(creativeAssets.id, params.creativeAssetId));

  return { metaAssetId };
}

export const studioService = {
  requestStudioImageGeneration,
  processStudioGenerationJob,
  uploadCreativeAssetToMeta,
};
