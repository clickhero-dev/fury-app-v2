import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StudioRepository } from '../../repository/studio.repository.js';
import { openrouterService } from '../llms/openrouter.service.js';
import { saveTemporaryStudioImage, studioAssetsDir } from '../../lib/temp-storage.js';
import { uploadAsset } from '../storage/storage.service.js';
import {
  consumeCreativeQuota,
  refundCreativeQuota,
  consumeModificationQuota,
  refundModificationQuota,
  getModificationsPerCreativeLimit,
} from '../studio/creative-quota.service.js';

// ─── Modelos disponíveis ─────────────────────────────────────────
const IMAGE_MODELS = [
  { id: 'bytedance-seed/seedream-4.5', label: 'Seedream 4.5', description: 'ByteDance — Mais barato ($0.04/img). Bom para alto volume.', category: 'barato', type: 'image' },
  { id: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 Klein 4B', description: 'Black Forest Labs — Melhor custo-benefício. Rápido e consistente.', category: 'custo-beneficio', type: 'image' },
  { id: 'black-forest-labs/flux.2-max', label: 'FLUX.2 Max', description: 'Black Forest Labs — Máxima qualidade. Ideal para campanhas premium.', category: 'qualidade', type: 'image' },
];
const VIDEO_MODELS = [
  { id: 'google/veo-3.1-lite', label: 'Veo 3.1 Lite', description: 'Google — Mais barato. Clipes 4-8s, 720p/1080p com áudio.', category: 'barato', type: 'video' },
  { id: 'kwaivgi/kling-video-o1', label: 'Kling Video O1', description: 'Kuaishou — Melhor custo-benefício. $0.112/s, cinematográfico.', category: 'custo-beneficio', type: 'video' },
  { id: 'google/veo-3.1', label: 'Veo 3.1', description: 'Google — Máxima qualidade. 1080p, áudio nativo, cenas estendidas. $0.40/s.', category: 'qualidade', type: 'video' },
];

const VOICE_TONE_LABELS: Record<string, string> = {
  professional: 'Profissional',
  casual: 'Casual',
  urgent: 'Urgente',
  premium: 'Premium/Sofisticado',
};

// ─── Upload helpers (storage) ────────────────────────────────────
async function uploadImageToStorage(base64DataUrl: string): Promise<string> {
  if (process.env.R2_ENDPOINT && process.env.R2_PUBLIC_URL) {
    const match = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const ext = mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
      return uploadAsset(buffer, `${randomUUID()}.${ext}`, mimeType);
    }
  }
  if (base64DataUrl.startsWith('data:')) {
    const match = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      const ext = match[1].includes('jpeg') ? 'jpg' : match[1].includes('webp') ? 'webp' : 'png';
      const fileName = `${randomUUID()}.${ext}`;
      await writeFile(join(studioAssetsDir, fileName), Buffer.from(match[2], 'base64'));
      return `https://${process.env.DOMAIN || 'clickhero-fury-api.u7pe19.easypanel.host'}/studio-assets/${fileName}`;
    }
  }
  const { fileName } = await saveTemporaryStudioImage(base64DataUrl);
  return `https://${process.env.DOMAIN || 'clickhero-fury-api.u7pe19.easypanel.host'}/studio-assets/${fileName}`;
}

async function uploadVideoToStorage(videoUrl: string): Promise<string> {
  if (process.env.R2_ENDPOINT && process.env.R2_PUBLIC_URL) {
    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error(`Failed to download video: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      return uploadAsset(buffer, `${randomUUID()}.mp4`, 'video/mp4');
    } catch (err) {
      console.error('[openrouter] Video upload to R2 failed, using original URL:', err);
    }
  }
  return videoUrl;
}

type LlmLike = Pick<
  typeof openrouterService,
  'chat' | 'generateImage' | 'generateVideo' | 'editImage'
>;

interface QuotaLike {
  consumeCreativeQuota: (t: string) => Promise<void | boolean>;
  refundCreativeQuota: (t: string) => Promise<void>;
  consumeModificationQuota: (rootAssetId: string) => Promise<boolean | void>;
  refundModificationQuota: (rootAssetId: string) => Promise<void>;
  getModificationsPerCreativeLimit: (t: string) => Promise<number | null>;
}

type StudioRepoF = (tenantId: string) => StudioRepository;

export class OpenRouterStudioService {
  constructor(
    private repoFactory: StudioRepoF = (t) => new StudioRepository(t),
    private llm: LlmLike = openrouterService,
    private quota: QuotaLike = {
      consumeCreativeQuota,
      refundCreativeQuota,
      consumeModificationQuota,
      refundModificationQuota,
      getModificationsPerCreativeLimit,
    },
  ) {}

  private repo(tenantId: string): StudioRepository {
    return this.repoFactory(tenantId);
  }

  getModels() {
    return { image: IMAGE_MODELS, video: VIDEO_MODELS };
  }

  async getBrandContext(tenantId: string): Promise<{
    businessName: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    voiceTone?: string;
  }> {
    const repo = this.repo(tenantId);
    const tenant = await repo.findTenant();
    const brandKit = await repo.findBrandKit();
    return {
      businessName: tenant?.name ?? 'Meu Negócio',
      logoUrl: brandKit?.logoUrl ?? undefined,
      primaryColor: brandKit?.primaryColor ?? undefined,
      secondaryColor: brandKit?.secondaryColor ?? undefined,
      voiceTone: brandKit?.voiceTone ? VOICE_TONE_LABELS[brandKit.voiceTone] : undefined,
    };
  }

  async enhancePrompt(tenantId: string, input: { prompt: string; type: 'image' | 'video' }): Promise<{
    enhancedPrompt: string;
    brand: { businessName: string; logoUrl?: string; primaryColor?: string; voiceTone?: string };
  }> {
    const brand = await this.getBrandContext(tenantId);
    const brandParts: string[] = [];
    brandParts.push(`Marca: ${brand.businessName}.`);
    if (brand.voiceTone) brandParts.push(`Tom de comunicação: ${brand.voiceTone}.`);
    if (brand.primaryColor) brandParts.push(`Cor primária: ${brand.primaryColor}.`);
    if (brand.secondaryColor) brandParts.push(`Cor secundária: ${brand.secondaryColor}.`);
    const brandContext = brandParts.join(' ');

    let finalPrompt: string;
    if (input.prompt.length < 100) {
      const typeLabel = input.type === 'video' ? 'vídeo publicitário' : 'imagem publicitária';
      const enhancePrompt = [
        `Você é um especialista em publicidade digital. Melhore o prompt abaixo para gerar um ${typeLabel} profissional.`,
        `Contexto da marca: ${brandContext}`,
        `Adicione detalhes visuais, iluminação, composição, cores da marca e tom de comunicação. PRESERVE RIGOROSAMENTE o tema principal do prompt original.`,
        `O prompt melhorado deve ter entre 150 e 400 caracteres e estar em português.`,
        ``,
        `Prompt original: "${input.prompt}"`,
        ``,
        `Retorne APENAS o prompt melhorado, sem aspas, sem introdução.`,
      ].join('\n');
      try {
        const improved = await this.llm.chat([{ role: 'user', content: enhancePrompt }], { temperature: 0.7, max_tokens: 600 });
        finalPrompt = improved.trim();
      } catch {
        finalPrompt = `${input.prompt}. ${brandContext}`;
      }
    } else {
      finalPrompt = `${brandContext} ${input.prompt}`;
    }

    return {
      enhancedPrompt: finalPrompt,
      brand: { businessName: brand.businessName, logoUrl: brand.logoUrl, primaryColor: brand.primaryColor, voiceTone: brand.voiceTone },
    };
  }

  async generateImage(
    tenantId: string,
    payload: { model: string; prompt: string; aspect_ratio: string; resolution: string },
  ): Promise<Record<string, any>> {
    await this.quota.consumeCreativeQuota(tenantId);
    try {
      const brand = await this.getBrandContext(tenantId);
      const base64Image = await this.llm.generateImage({
        model: payload.model,
        prompt: payload.prompt,
        aspect_ratio: payload.aspect_ratio,
        resolution: payload.resolution,
        logoUrl: brand.logoUrl,
      });
      const imageUrl = await uploadImageToStorage(base64Image);
      const modificationsRemaining = await this.quota.getModificationsPerCreativeLimit(tenantId);
      const asset = await this.repo(tenantId).createAsset({
        tenantId,
        type: 'image',
        url: imageUrl,
        complianceStatus: 'pending_compliance',
        modificationsRemaining,
        complianceNotes: JSON.stringify({
          prompt: payload.prompt,
          model: payload.model,
          generatedAt: new Date().toISOString(),
          source: 'openrouter-quick-create',
          brand: { businessName: brand.businessName, primaryColor: brand.primaryColor },
        }),
      });
      return {
        type: 'image' as const,
        creativeAssetId: asset.id,
        imageUrl,
        model: payload.model,
        prompt: payload.prompt,
        generatedAt: new Date().toISOString(),
        status: 'pending_compliance' as const,
        modificationsRemaining,
      };
    } catch (error) {
      await this.quota.refundCreativeQuota(tenantId);
      throw error;
    }
  }

  async generateVideo(
    tenantId: string,
    payload: { model: string; prompt: string; duration: number; resolution: string; aspect_ratio: string; generate_audio: boolean },
  ): Promise<Record<string, any>> {
    const videoUrl = await this.llm.generateVideo({
      model: payload.model,
      prompt: payload.prompt,
      duration: payload.duration,
      resolution: payload.resolution,
      aspect_ratio: payload.aspect_ratio,
      generate_audio: payload.generate_audio,
    });
    const brand = await this.getBrandContext(tenantId);
    const storedVideoUrl = await uploadVideoToStorage(videoUrl);
    const asset = await this.repo(tenantId).createAsset({
      tenantId,
      type: 'video',
      url: storedVideoUrl,
      complianceStatus: 'pending_compliance',
      complianceNotes: JSON.stringify({
        prompt: payload.prompt,
        model: payload.model,
        duration: payload.duration,
        generatedAt: new Date().toISOString(),
        source: 'openrouter-quick-create',
        brand: { businessName: brand.businessName, primaryColor: brand.primaryColor },
      }),
    });
    return {
      type: 'video' as const,
      creativeAssetId: asset.id,
      videoUrl: storedVideoUrl,
      model: payload.model,
      prompt: payload.prompt,
      duration: payload.duration,
      generatedAt: new Date().toISOString(),
      status: 'pending_compliance' as const,
    };
  }

  async regenerate(tenantId: string, input: { assetId: string; feedback: string }): Promise<Record<string, any>> {
    const asset = await this.repo(tenantId).findAssetById(input.assetId);
    if (!asset) throw new Error('ASSET_NOT_FOUND');

    let originalPrompt = '';
    let originalModel = '';
    let assetType: 'image' | 'video' = 'image';
    try {
      const meta = JSON.parse(asset.complianceNotes ?? '{}');
      originalPrompt = meta.prompt ?? '';
      originalModel = meta.model ?? '';
      assetType = asset.type === 'video' ? 'video' : 'image';
    } catch { /* fallback */ }

    if (!originalPrompt || !originalModel) {
      throw new Error('ASSET_INSUFFICIENT_DATA');
    }

    const brand = await this.getBrandContext(tenantId);
    const enhancePrompt = [
      `Prompt original: "${originalPrompt}"`,
      `Feedback: "${input.feedback}"`,
      `Marca: ${brand.businessName}.`,
      ``,
      `REGRAS (OBRIGATÓRIO):`,
      `- Edite APENAS o trecho do prompt que o feedback menciona.`,
      `- PRESERVE rigorosamente todo o restante (tema, estilo, cores, composição).`,
      `- NÃO adicione logotipos, NÃO mude o layout, NÃO reescreva frases não mencionadas.`,
      `- Faça a MENOR alteração possível.`,
      `Retorne APENAS o prompt editado, sem aspas, sem introdução.`,
    ].filter(Boolean).join('\n');

    let newPrompt: string;
    try {
      newPrompt = (await this.llm.chat([{ role: 'user', content: enhancePrompt }], { temperature: 0.1, max_tokens: 800 })).trim();
    } catch {
      newPrompt = `${originalPrompt}. Ajuste: ${input.feedback}`;
    }

    if (assetType === 'video') {
      const rawVideoUrl = await this.llm.generateVideo({
        model: originalModel,
        prompt: newPrompt,
        duration: 4,
        resolution: '720p',
        generate_audio: true,
      });
      const storedVideoUrl = await uploadVideoToStorage(rawVideoUrl);
      const newAsset = await this.repo(tenantId).createAsset({
        tenantId,
        type: 'video',
        url: storedVideoUrl,
        complianceStatus: 'pending_compliance',
        complianceNotes: JSON.stringify({
          prompt: newPrompt,
          model: originalModel,
          generatedAt: new Date().toISOString(),
          source: 'openrouter-regenerate',
          originalAssetId: input.assetId,
          feedback: input.feedback,
        }),
      });
      return { type: 'video' as const, assetId: newAsset.id, videoUrl: storedVideoUrl, creativeData: { headline: '', primary_text: '', cta: '' } };
    }

    const base64Image = await this.llm.generateImage({ model: originalModel, prompt: newPrompt, logoUrl: brand.logoUrl });
    const imageUrl = await uploadImageToStorage(base64Image);
    const newAsset = await this.repo(tenantId).createAsset({
      tenantId,
      type: 'image',
      url: imageUrl,
      complianceStatus: 'pending_compliance',
      complianceNotes: JSON.stringify({
        prompt: newPrompt,
        model: originalModel,
        generatedAt: new Date().toISOString(),
        source: 'openrouter-regenerate',
        originalAssetId: input.assetId,
        feedback: input.feedback,
      }),
    });
    return { type: 'image' as const, assetId: newAsset.id, imageUrl, creativeData: { headline: '', primary_text: '', cta: '' } };
  }

  async regenerateAd(
    tenantId: string,
    input: { assetId: string; feedback: string; mask?: { buffer: Buffer; mime: string } },
  ): Promise<Record<string, any>> {
    const asset = await this.repo(tenantId).findAssetById(input.assetId);
    if (!asset) throw new Error('ASSET_NOT_FOUND');

    const rootAssetId = asset.rootAssetId ?? asset.id;
    await this.quota.consumeModificationQuota(rootAssetId);

    let imageUrl: string;
    let source = 'openrouter-edit-image';
    try {
      let maskImageUrl: string | undefined;
      if (input.mask) {
        try {
          const mime = input.mask.mime.includes('png') ? 'image/png' : 'image/jpeg';
          maskImageUrl = `data:${mime};base64,${input.mask.buffer.toString('base64')}`;
          source = 'openrouter-edit-image-mask';
        } catch (e) {
          console.warn('[regenerate-ad] falha ao ler máscara, regenerando sem ela:', (e as Error).message);
        }
      }
      imageUrl = await this.llm.editImage({
        imageUrl: asset.url,
        instructions: input.feedback,
        ...(maskImageUrl ? { maskImageUrl } : {}),
      });
    } catch (error) {
      await this.quota.refundModificationQuota(rootAssetId);
      throw error;
    }

    const root = await this.repo(tenantId).findAssetById(rootAssetId);
    const newAsset = await this.repo(tenantId).createAsset({
      tenantId,
      type: 'image',
      url: imageUrl,
      complianceStatus: 'pending_compliance',
      rootAssetId,
      complianceNotes: JSON.stringify({
        generatedAt: new Date().toISOString(),
        source,
        originalAssetId: input.assetId,
        feedback: input.feedback,
      }),
    });
    return {
      type: 'image' as const,
      assetId: newAsset.id,
      imageUrl,
      creativeData: { headline: '', primary_text: '', cta: '' },
      modificationsRemaining: root?.modificationsRemaining ?? null,
    };
  }
}