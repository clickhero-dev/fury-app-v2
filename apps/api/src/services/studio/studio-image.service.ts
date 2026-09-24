import { AppError } from '../../middleware/errorHandler.js';
import { createAdCreativeFromCopy, uploadAdImage } from '../../lib/meta-api.js';
import { decryptMetaToken } from '../../utils/crypto.js';
import { saveTemporaryStudioImage } from '../../lib/temp-storage.js';
import { getComplianceQueue } from '../../lib/queue.js';
import { openrouterService } from '../llms/openrouter.service.js';
import { enhancePromptForImage } from '../llms/prompt-enhancer.js';
import { StudioRepository } from '../../repository/studio.repository.js';

export type StudioImageGenerationResult = {
  creativeAssetId: string;
  imageUrl: string;
  prompt: string;
  generatedAt: string;
  status: 'pending_compliance';
};

export type StudioAssetVersion = {
  id: string;
  url: string;
  complianceStatus: 'pending' | 'pending_compliance' | 'approved' | 'rejected';
  createdAt: string;
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
  /** Id da raiz do grupo (linhagem: original + modificações). */
  groupId: string;
  /** Id da versão "em evidência" — mesma versão dos campos acima. */
  activeVersionId: string;
  /** Todas as versões do grupo, ordenadas por criação (para o carrossel). */
  versions: StudioAssetVersion[];
  modificationsRemaining: number | null;
  archivedAt: string | null;
};

function normalizePublicBaseUrl(publicBaseUrl: string) {
  return publicBaseUrl.replace(/\/+$/, '');
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
  const repo = new StudioRepository(params.tenantId);

  let sourceUrl: string;
  // Geração SEMPRE via OpenRouter (FLUX) — nunca DALL-E/OpenAI.
  // Sem OPENROUTER_API_KEY o próprio serviço lança 500 OPENROUTER_API_KEY_MISSING.
  const brandKit = await repo.findBrandKit();
  sourceUrl = await openrouterService.generateImage({
    model: 'black-forest-labs/flux.2-pro',
    prompt: enhancedPrompt,
    logoUrl: brandKit?.logoUrl ?? undefined,
  });

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

  const asset = await repo.createAsset({
    tenantId: params.tenantId,
    type: 'image',
    url: imageUrl,
    complianceStatus: 'pending_compliance',
    complianceNotes: JSON.stringify({ prompt: params.prompt, generatedAt }),
  });

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

/**
 * Resolve o grupo (linhagem) a partir de QUALQUER assetId dele — raiz ou
 * modificação — e devolve os dados da versão em EVIDÊNCIA (não
 * necessariamente a do `assetId` pedido). `versions` traz o grupo inteiro
 * ordenado, para o carrossel/numeração da tela de detalhes.
 */
export async function getStudioAssetById(params: {
  tenantId: string;
  assetId: string;
}): Promise<StudioComplianceStatusResult> {
  const repo = new StudioRepository(params.tenantId);
  const asset = await repo.findAssetById(params.assetId);

  if (!asset) {
    throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo nao encontrado.');
  }

  const rootId = asset.rootAssetId ?? asset.id;
  const groupVersions = await repo.findGroupVersions(rootId);
  const root = groupVersions.find((v) => v.id === rootId) ?? asset;
  const activeVersionId = root.activeAssetId ?? root.id;
  // Fallback defensivo: se por algum motivo a versão ativa não estiver no
  // grupo carregado (não deveria acontecer — ON DELETE SET NULL cobre o
  // caso de exclusão), cai pra raiz.
  const displayAsset = groupVersions.find((v) => v.id === activeVersionId) ?? root;

  const parsed = parseComplianceNotes(displayAsset.complianceNotes ?? null);

  return {
    assetId: displayAsset.id,
    tenantId: displayAsset.tenantId,
    imageUrl: displayAsset.url,
    complianceStatus: displayAsset.complianceStatus,
    complianceNotes: displayAsset.complianceNotes ?? null,
    approved: parsed.approved,
    issues: parsed.issues,
    textPercentage: parsed.textPercentage,
    metaAssetId: displayAsset.metaAssetId ?? null,
    createdAt: displayAsset.createdAt.toISOString(),
    groupId: rootId,
    activeVersionId,
    versions: groupVersions.map((v) => ({
      id: v.id,
      url: v.url,
      complianceStatus: v.complianceStatus,
      createdAt: v.createdAt.toISOString(),
    })),
    modificationsRemaining: root.modificationsRemaining ?? null,
    archivedAt: root.archivedAt ? root.archivedAt.toISOString() : null,
  };
}

/**
 * Marca `assetId` como a versão em evidência do grupo — chamado quando o
 * usuário navega até uma versão no carrossel (RF-02/RF-03). Funciona também
 * em grupos arquivados (RF-10).
 */
export async function setActiveStudioAssetVersion(params: {
  tenantId: string;
  assetId: string;
}): Promise<StudioComplianceStatusResult> {
  const repo = new StudioRepository(params.tenantId);
  const asset = await repo.findAssetById(params.assetId);

  if (!asset) {
    throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo nao encontrado.');
  }

  const rootId = asset.rootAssetId ?? asset.id;
  await repo.setActiveAsset(rootId, asset.id);

  return getStudioAssetById(params);
}

export async function publishStudioAssetToMeta(params: {
  tenantId: string;
  assetId: string;
  adAccountId?: string;
}): Promise<{ hash: string; imageUrl: string; metaAssetId: string; adsManagerUrl: string }> {
  const repo = new StudioRepository(params.tenantId);
  const asset = await repo.findAssetById(params.assetId);

  if (!asset) {
    throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo nao encontrado.');
  }

  if (asset.complianceStatus !== 'approved') {
    throw new AppError(409, 'ASSET_NOT_APPROVED', 'O asset precisa estar aprovado no compliance antes da publicacao.');
  }

  const connection = await repo.findLatestMetaConnection();

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

    await repo.patchAsset(asset.id, { metaAssetId: creativeId, complianceStatus: 'approved' });

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

  await repo.patchAsset(asset.id, { metaAssetId: hash, complianceStatus: 'approved' });

  const adsManagerUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${selectedAdAccountId}&cid=${hash}`;

  return {
    hash,
    imageUrl: asset.url,
    metaAssetId: hash,
    adsManagerUrl,
  };
}