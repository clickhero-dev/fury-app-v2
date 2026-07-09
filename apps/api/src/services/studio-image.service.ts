import OpenAI from 'openai';
import { and, eq } from 'drizzle-orm';
import { db, creativeAssets, metaConnections } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';
import { createAdCreativeFromCopy, uploadAdImage } from '../lib/meta-api.js';
import { decryptMetaToken } from '../utils/crypto.js';
import { saveTemporaryStudioImage } from '../lib/temp-storage.js';
import { getComplianceQueue } from '../lib/queue.js';
import { openrouterService } from './openrouter.service.js';

export type StudioImageGenerationResult = {
  creativeAssetId: string;
  imageUrl: string;
  prompt: string;
  generatedAt: string;
  status: 'pending_compliance';
};

export type StudioComplianceStatusResult = {
  assetId: string;
  tenantId: string;
  imageUrl: string;
  complianceStatus: 'pending' | 'pending_compliance' | 'approved' | 'rejected';
  complianceNotes: string | null;
  approved: boolean | null;
  issues: string[];
  textPercentage: number | null;
  metaAssetId: string | null;
  createdAt: string;
};

async function enhancePromptForImage(prompt: string): Promise<string> {
  if (prompt.length >= 100) return prompt;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return prompt;

  const systemMessage = [
    'Você é um especialista em publicidade digital especializado em descrições de imagens.',
    'Preserve o tema principal do prompt original. Adicione detalhes visuais (iluminação, composição, ângulo, cores) SEM mudar o assunto principal.',
    'O prompt melhorado deve ter entre 150 e 400 caracteres e estar em português.',
    'Retorne APENAS o prompt melhorado, sem aspas, sem introdução.',
  ].join('\n');

  const userMessage = `Prompt original: "${prompt}"`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 600,
      }),
    });

    if (!response.ok) return prompt;

    const data = await response.json() as { choices?: { message?: { content: string } }[] };
    const improved = data?.choices?.[0]?.message?.content?.trim();
    return improved && improved.length > 0 ? improved : prompt;
  } catch {
    return prompt;
  }
}

const OPENAI_IMAGE_MODEL = 'dall-e-3';
const STUDIO_IMAGE_SIZE = '1024x1024';
const STUDIO_IMAGE_QUALITY = 'standard';
const STUDIO_IMAGE_STYLE = 'vivid';

function normalizePublicBaseUrl(publicBaseUrl: string) {
  return publicBaseUrl.replace(/\/+$/, '');
}

function buildOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new AppError(500, 'OPENAI_API_KEY_MISSING', 'OPENAI_API_KEY nao configurada.');
  }

  return new OpenAI({ apiKey });
}

async function generateOpenAIImage(prompt: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new AppError(500, 'OPENAI_API_KEY_MISSING', 'OPENAI_API_KEY nao configurada.');
  }

  const client = buildOpenAIClient();
  const response = await client.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt,
    size: STUDIO_IMAGE_SIZE,
    quality: STUDIO_IMAGE_QUALITY,
    style: STUDIO_IMAGE_STYLE,
  });

  const generatedUrl = response.data?.[0]?.url;
  const generatedBase64 = response.data?.[0]?.b64_json;

  if (generatedUrl) {
    return generatedUrl;
  }

  if (generatedBase64) {
    return `data:image/png;base64,${generatedBase64}`;
  }

  throw new AppError(502, 'OPENAI_IMAGE_GENERATION_FAILED', 'OpenAI nao retornou a imagem gerada.');
}

function parseComplianceNotes(complianceNotes: string | null) {
  if (!complianceNotes) {
    return {
      approved: null as boolean | null,
      issues: [] as string[],
      textPercentage: null as number | null,
    };
  }

  const jsonMatch = complianceNotes.match(/data=(\{[\s\S]*\})/) || complianceNotes.match(/\{[\s\S]*\}$/);
  const rawJson = jsonMatch ? jsonMatch[1] || jsonMatch[0] : null;

  if (!rawJson) {
    return {
      approved: null as boolean | null,
      issues: [complianceNotes],
      textPercentage: null as number | null,
    };
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
      return {
        approved: null as boolean | null,
        issues: [],
        textPercentage: null as number | null,
      };
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
    return {
      approved: null as boolean | null,
      issues: [complianceNotes],
      textPercentage: null as number | null,
    };
  }
}

function parseCopyAssetPayload(url: string): {
  headline: string;
  primary_text: string;
  cta: string;
} {
  if (!url.startsWith('data:application/json;base64,')) {
    throw new AppError(400, 'INVALID_COPY_ASSET', 'Formato do asset de copy invalido.');
  }

  const base64 = url.replace('data:application/json;base64,', '');
  let parsed: any;

  try {
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    parsed = JSON.parse(decoded);
  } catch {
    throw new AppError(400, 'INVALID_COPY_ASSET', 'Nao foi possivel ler o payload de copy.');
  }

  return {
    headline: String(parsed?.headline || ''),
    primary_text: String(parsed?.primary_text || ''),
    cta: String(parsed?.cta || 'Saiba mais'),
  };
}

async function persistGeneratedImage(params: {
  tenantId: string;
  prompt: string;
  publicBaseUrl: string;
}): Promise<StudioImageGenerationResult> {
  const enhancedPrompt = await enhancePromptForImage(params.prompt);

  let sourceUrl: string;
  if (process.env.OPENROUTER_API_KEY) {
    sourceUrl = await openrouterService.generateImage({
      model: 'black-forest-labs/flux.2-klein-4b',
      prompt: enhancedPrompt,
    });
  } else {
    sourceUrl = await generateOpenAIImage(enhancedPrompt);
  }

  // OpenAI returns a temporary CDN URL — use it directly so the browser can
  // display the image immediately. The compliance worker re-downloads it
  // independently during analysis. Only fall back to local storage for
  // base64 data URLs (future-proofing if response_format changes).
  let imageUrl: string;
  if (sourceUrl.startsWith('http')) {
    imageUrl = sourceUrl;
  } else {
    const { fileName } = await saveTemporaryStudioImage(sourceUrl);
    imageUrl = `${normalizePublicBaseUrl(params.publicBaseUrl)}/studio-assets/${fileName}`;
  }

  const generatedAt = new Date().toISOString();

  const [asset] = await db
    .insert(creativeAssets)
    .values({
      tenantId: params.tenantId,
      type: 'image',
      url: imageUrl,
      complianceStatus: 'pending_compliance',
      complianceNotes: JSON.stringify({ prompt: params.prompt, generatedAt }),
    })
    .returning();

  const complianceQueue = await getComplianceQueue();
  await complianceQueue.add(
    'studio:compliance-check',
    { creativeAssetId: asset.id, tenantId: params.tenantId },
    {
      removeOnComplete: 1000,
      removeOnFail: 5000,
    }
  );

  return {
    creativeAssetId: asset.id,
    imageUrl,
    prompt: params.prompt,
    generatedAt,
    status: 'pending_compliance',
  };
}

export async function generateImage(prompt: string, tenantId: string, publicBaseUrl = process.env.PUBLIC_BASE_URL || ''): Promise<StudioImageGenerationResult> {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new AppError(400, 'INVALID_PROMPT', 'Prompt da imagem e obrigatorio.');
  }

  if (!tenantId) {
    throw new AppError(400, 'INVALID_TENANT', 'tenantId e obrigatorio.');
  }

  if (!publicBaseUrl) {
    throw new AppError(500, 'PUBLIC_BASE_URL_MISSING', 'PUBLIC_BASE_URL nao configurada.');
  }

  return persistGeneratedImage({
    tenantId,
    prompt: normalizedPrompt,
    publicBaseUrl,
  });
}

export async function getStudioAssetById(params: {
  tenantId: string;
  assetId: string;
}): Promise<StudioComplianceStatusResult> {
  const asset = await db.query.creativeAssets.findFirst({
    where: and(eq(creativeAssets.id, params.assetId), eq(creativeAssets.tenantId, params.tenantId)),
  });

  if (!asset) {
    throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo nao encontrado.');
  }

  const parsed = parseComplianceNotes(asset.complianceNotes ?? null);

  return {
    assetId: asset.id,
    tenantId: asset.tenantId,
    imageUrl: asset.url,
    complianceStatus: asset.complianceStatus,
    complianceNotes: asset.complianceNotes ?? null,
    approved: parsed.approved,
    issues: parsed.issues,
    textPercentage: parsed.textPercentage,
    metaAssetId: asset.metaAssetId ?? null,
    createdAt: asset.createdAt.toISOString(),
  };
}

export async function publishStudioAssetToMeta(params: {
  tenantId: string;
  assetId: string;
  adAccountId?: string;
}): Promise<{ hash: string; imageUrl: string; metaAssetId: string; adsManagerUrl: string }> {
  const asset = await db.query.creativeAssets.findFirst({
    where: and(eq(creativeAssets.id, params.assetId), eq(creativeAssets.tenantId, params.tenantId)),
  });

  if (!asset) {
    throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo nao encontrado.');
  }

  if (asset.complianceStatus !== 'approved') {
    throw new AppError(409, 'ASSET_NOT_APPROVED', 'O asset precisa estar aprovado no compliance antes da publicacao.');
  }

  const connection = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, params.tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!connection) {
    throw new AppError(404, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexao Meta encontrada para este tenant.');
  }

  const adAccounts = (connection.adAccounts || []) as Array<{ id?: string }>;
  const selectedAdAccountId = params.adAccountId || adAccounts.find((account) => account.id)?.id;

  if (!selectedAdAccountId) {
    throw new AppError(400, 'AD_ACCOUNT_MISSING', 'Nenhuma ad account disponivel para publicar o asset.');
  }

  const accessToken = decryptMetaToken(connection.accessToken);

  // Shared publishing flow: same endpoint and tenant/account resolution,
  // with type-specific branch only for the final Meta API call.
  if (asset.type === 'copy') {
    const copy = parseCopyAssetPayload(asset.url);
    const pageId = process.env.META_PAGE_ID;
    const linkUrl = process.env.META_DEFAULT_LINK_URL || 'https://example.com';

    if (!pageId && process.env.META_USE_MOCK !== 'true') {
      throw new AppError(400, 'META_PAGE_ID_MISSING', 'META_PAGE_ID e obrigatoria para publicar copy no Meta.');
    }

    const creativeId = await createAdCreativeFromCopy({
      adAccountId: selectedAdAccountId,
      accessToken,
      headline: copy.headline,
      primaryText: copy.primary_text,
      cta: copy.cta,
      pageId: pageId || 'mock_page_id',
      linkUrl,
    });

    await db
      .update(creativeAssets)
      .set({ metaAssetId: creativeId, complianceStatus: 'approved' })
      .where(eq(creativeAssets.id, asset.id));

    const adsManagerUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${selectedAdAccountId}&cid=${creativeId}`;

    return {
      hash: creativeId,
      imageUrl: asset.url,
      metaAssetId: creativeId,
      adsManagerUrl,
    };
  }

  const response = await fetch(asset.url);

  if (!response.ok) {
    throw new AppError(502, 'IMAGE_DOWNLOAD_FAILED', 'Nao foi possivel baixar a imagem do asset.');
  }

  const contentType = response.headers.get('content-type') || '';
  const mimeType = contentType.split(';')[0]?.trim() ?? '';

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new AppError(400, 'INVALID_IMAGE_FORMAT', `Formato de imagem invalido: ${mimeType || 'desconhecido'}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const filename = new URL(asset.url).pathname.split('/').pop() || 'image.png';

  const hash = await uploadAdImage({
    adAccountId: selectedAdAccountId,
    base64,
    filename,
    accessToken,
  });

  await db
    .update(creativeAssets)
    .set({ metaAssetId: hash, complianceStatus: 'approved' })
    .where(eq(creativeAssets.id, asset.id));

  const adsManagerUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${selectedAdAccountId}&cid=${hash}`;

  return {
    hash,
    imageUrl: asset.url,
    metaAssetId: hash,
    adsManagerUrl,
  };
}