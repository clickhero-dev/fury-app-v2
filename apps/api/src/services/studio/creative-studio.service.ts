import { randomUUID } from 'crypto';
import fs from 'fs';
import { join } from 'path';
import OpenAI from 'openai';
import { StudioRepository } from '../../repository/studio.repository.js';
import { deepseekService } from '../llms/deepseek.service.js';
import { studioCopyService } from '../studio/studio-copy.service.js';
import {
  buildCreativePrompt,
  buildRegeneratePrompt,
  buildValidationPrompt,
  type CreativeContext,
} from '../../prompts/creative-studio.prompt.js';
import { convertHTMLToPNG, type BrandColors } from '../studio/html-to-png.service.js';
import { sanitizeTypos } from '../../utils/sanitize-typos.js';
import { selectLayout } from '../studio/layout-selector.service.js';
import type { CreativeData } from '../studio/creative-data.js';
import { studioAssetsDir } from '../../lib/temp-storage.js';
import { uploadAsset } from '../storage/storage.service.js';
import { AppError } from '../../middleware/errorHandler.js';
import type { CreativeLayout } from '@fury/shared';
import { CREATIVE_LAYOUT_LABELS, CREATIVE_LAYOUT_FUNNEL_STAGE } from '@fury/shared';

type StudioRepoF = (tenantId: string) => StudioRepository;
type Llm = Pick<typeof deepseekService, 'chat'>;

interface StudioDeps {
  llm: Llm;
  storage: { uploadAsset: typeof uploadAsset };
  openai: OpenAI;
  copy: { generateAdCopy: typeof studioCopyService.generateAdCopy };
}

const VOICE_TONE_LABELS: Record<string, string> = {
  professional: 'Profissional',
  casual: 'Casual',
  urgent: 'Urgente',
  premium: 'Premium/Sofisticado',
};

type CopyType = 'headline' | 'descricao' | 'cta' | 'completo';
const COPY_LIMITS: Record<CopyType, number> = { headline: 40, descricao: 125, cta: 20, completo: 300 };

function calcularPontuacao(texto: string, type: CopyType): number {
  const limite = COPY_LIMITS[type] ?? 300;
  let score = 3;
  if (texto.length <= limite) score += 3;
  const ctaWords = ['compre', 'acesse', 'saiba', 'clique', 'garanta'];
  if (ctaWords.some(w => texto.toLowerCase().includes(w))) score += 2;
  const forbidden = ['grátis excessivo', 'garantido 100%', 'melhor do mundo'];
  if (!forbidden.some(w => texto.toLowerCase().includes(w))) score += 2;
  return Math.min(10, Math.max(0, Math.round((score + Number.EPSILON) * 10) / 10));
}

function getMockVariations(body: any, quantidade: number): any[] {
  const mockOptions = [
    { texto: `${body.produto} — transforme seu negócio hoje!`, pontuacao: 7.0 },
    { texto: `Descubra ${body.produto} para ${body.publico}`, pontuacao: 6.5 },
    { texto: `A melhor solução em ${body.produto}`, pontuacao: 8.0 },
    { texto: `Clique e conheça ${body.produto}`, pontuacao: 7.5 },
    { texto: `Garanta ${body.produto} agora mesmo`, pontuacao: 7.8 },
  ];
  const total = Math.min(Math.max(quantidade || 3, 3), 5);
  return Array.from({ length: total }, (_, index) => {
    const item = mockOptions[index % mockOptions.length];
    return { texto: item.texto, caracteres: item.texto.length, pontuacao: item.pontuacao };
  });
}

function parseCreativeJSON(raw: string) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

function imageFieldsForLayout(layout: CreativeLayout, imageUrl?: string): Pick<CreativeData, 'background_image_url' | 'product_image_url' | 'hero_image_url'> {
  if (!imageUrl) return {};
  if (layout === 'split_diagonal_product') return { product_image_url: imageUrl };
  if (layout === 'offer_burst') return { hero_image_url: imageUrl };
  return { background_image_url: imageUrl };
}

function savePNG(buffer: Buffer): Promise<{ fileName: string }> {
  const dir = studioAssetsDir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fileName = `${randomUUID()}.png`;
  const filePath = join(dir, fileName);
  fs.writeFileSync(filePath, buffer);
  return Promise.resolve({ fileName });
}

function buildCreativeData(args: {
  layout: CreativeLayout;
  body: any;
  businessName: string;
  brandColors?: BrandColors;
  copy?: Record<string, unknown>;
}): CreativeData {
  const { layout, body, businessName, brandColors } = args;
  const copy = (args.copy ?? {}) as Record<string, string | string[] | undefined>;
  const imageUrl = body.background_image_url || body.product_image_url || body.hero_image_url || body.productImageUrl;
  return {
    layout,
    headline: body.headline || (copy.headline as string) || '',
    subheadline: body.subheadline || (copy.subheadline as string),
    qualifier: body.qualifier || (copy.qualifier as string),
    offer_text: body.offer_text || (copy.offer_text as string),
    subtitle: body.subtitle || (copy.subtitle as string),
    subtitle_highlight: body.subtitle_highlight || (copy.subtitle_highlight as string),
    benefits: body.benefits || (copy.benefits as string[] | undefined),
    cta: body.cta || (copy.cta as string),
    cta_icon: body.cta_icon,
    price_text: body.price_text,
    ...imageFieldsForLayout(layout, imageUrl),
    tone: body.tone,
    top_zone_color: body.top_zone_color,
    highlight_color: body.highlight_color,
    businessName,
    includeLogo: body.includeLogo ?? true,
    brand_colors: {
      primary: brandColors?.primary || '#EA580C',
      accent: brandColors?.secondary || undefined,
    },
  };
}

export class StudioService {
  constructor(
    private repoFactory: StudioRepoF = (t) => new StudioRepository(t),
    private deps: StudioDeps = {
      llm: deepseekService,
      storage: { uploadAsset },
      openai: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      copy: { generateAdCopy: studioCopyService.generateAdCopy },
    },
  ) {}

  private repo(tenantId: string): StudioRepository {
    return this.repoFactory(tenantId);
  }

  async getTenantContext(tenantId: string): Promise<{ businessName: string; objective: string }> {
    const repo = this.repo(tenantId);
    const tenant = await repo.findTenant();
    const goal = await repo.findClientGoal();
    return { businessName: tenant?.name ?? 'Meu Negócio', objective: goal?.objective ?? 'gerar leads' };
  }

  async getBrandKitContext(tenantId: string): Promise<{ tone?: string; colors?: BrandColors }> {
    const brandKit = await this.repo(tenantId).findBrandKit();
    if (!brandKit) return {};
    return {
      tone: brandKit.voiceTone ? `Tom de voz da marca: ${VOICE_TONE_LABELS[brandKit.voiceTone]}. Escreva o copy seguindo esse tom.` : undefined,
      colors: brandKit.primaryColor || brandKit.logoUrl
        ? { primary: brandKit.primaryColor, secondary: brandKit.secondaryColor, logoUrl: brandKit.logoUrl }
        : undefined,
    };
  }

  // ── Copy ───────────────────────────────────────────────────────
  async generateAdCopy(input: { objective?: string; product?: string; audience?: string; tone?: string; quantity?: number }, tenantId: string) {
    return this.deps.copy.generateAdCopy(input as any, tenantId);
  }

  async generateCopyLegacy(body: any, type: CopyType, quantidade: number) {
    if (!process.env.OPENAI_API_KEY) return { variacoes: getMockVariations(body, quantidade) };
    const systemPrompt = `Você é um especialista em copywriting para anúncios digitais no Facebook e Instagram. Gere variações de copy persuasivas, claras e em português brasileiro. Respeite RIGOROSAMENTE os limites de caracteres especificados. Responda APENAS em JSON válido sem texto adicional.`;
    const userPrompt = `Produto: ${body.produto}\nPúblico: ${body.publico}\nObjetivo: ${body.objetivo}\nTom: ${body.tom}\n\nGere ${quantidade} variações de ${type} em português, limite máximo ${COPY_LIMITS[type] ?? 300} caracteres.\n\nRetorne APENAS:\n{"variacoes": [{"texto": "..."}]}`;
    const chatResponse = await this.deps.openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const text = chatResponse.choices[0]?.message?.content ?? '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error('[PARSE ERROR]', err);
      return { variacoes: getMockVariations(body, quantidade) };
    }
    if (!parsed?.variacoes || !Array.isArray(parsed.variacoes)) {
      return { variacoes: getMockVariations(body, quantidade) };
    }
    const result = parsed.variacoes.map((v: any) => {
      const texto = String(v.texto || v.text || '');
      return { texto, caracteres: texto.length, pontuacao: calcularPontuacao(texto, type) };
    });
    return { variacoes: result };
  }

  // ── Pipeline criativo ──────────────────────────────────────────
  async validateContext(tenantId: string, body: any) {
    const { businessName } = await this.getTenantContext(tenantId);
    const prompt = buildValidationPrompt({ businessName, product: body.product, promise: body.promise, offer: body.offer, audience: body.audience });
    const raw = await this.deps.llm.chat([{ role: 'user', content: prompt }], { temperature: 0.2, max_tokens: 600 });
    return parseCreativeJSON(raw);
  }

  async runGenerate(
    body: any,
    context: CreativeContext,
    tenantId: string,
    publicBaseUrl: string,
    brandColors?: BrandColors,
    layoutSelection?: { layout: CreativeLayout; confidence: number; justification: string },
  ) {
    let copy: Record<string, unknown> | undefined;
    if (!body.skipCopy) {
      const prompt = buildCreativePrompt(context);
      const raw = await this.deps.llm.chat([{ role: 'user', content: prompt }], { temperature: 0.8 });
      copy = parseCreativeJSON(raw);
    }
    const creativeData = buildCreativeData({ layout: context.layout, body, businessName: context.businessName, brandColors, copy });
    const pngBuffer = await convertHTMLToPNG(creativeData, brandColors);
    let imageUrl: string;
    if (process.env.R2_ENDPOINT && process.env.R2_PUBLIC_URL) {
      imageUrl = await this.deps.storage.uploadAsset(pngBuffer, `${randomUUID()}.png`);
    } else {
      const { fileName } = await savePNG(pngBuffer);
      imageUrl = `${publicBaseUrl.replace(/\/+$/, '')}/studio-assets/${fileName}`;
    }
    const metadata = JSON.stringify({ ...creativeData, context, layoutSelection });
    const asset = await this.repo(tenantId).createAsset({
      tenantId,
      type: 'image',
      url: imageUrl,
      complianceStatus: 'pending_compliance',
      complianceNotes: metadata,
    });
    return {
      assetId: asset.id,
      imageUrl,
      creativeData: {
        layout: creativeData.layout,
        headline: creativeData.headline,
        subheadline: creativeData.subheadline,
        qualifier: creativeData.qualifier,
        offer_text: creativeData.offer_text,
        subtitle: creativeData.subtitle,
        subtitle_highlight: creativeData.subtitle_highlight,
        benefits: creativeData.benefits,
        cta: creativeData.cta,
      },
    };
  }

  async generateCreative(tenantId: string, body: any, publicBaseUrl: string) {
    const { businessName, objective } = await this.getTenantContext(tenantId);
    const brandKitContext = await this.getBrandKitContext(tenantId);
    const adaptive = body.adaptiveAnswers ?? {};
    const product = adaptive.product || body.product;
    const promise = adaptive.promise || body.promise;
    const offer = adaptive.offer || body.offer;
    const audience = adaptive.audience || body.audience;

    const layoutResult = await selectLayout({
      tenantId,
      briefing: { product, promise, offer, audience },
      assets: { hasProductImage: body.hasProductImage, productImageUrl: body.product_image_url || body.productImageUrl, hasLogo: !!brandKitContext.colors?.logoUrl },
      brand: { primary_color: brandKitContext.colors?.primary || '#EA580C', accent_color: brandKitContext.colors?.secondary || undefined, brand_voice: brandKitContext.tone },
    });
    const resolvedLayout: CreativeLayout = body.layout ?? layoutResult.layout;
    const context: CreativeContext = {
      product,
      promise,
      offer,
      audience,
      hasProductImage: body.hasProductImage,
      productImageUrl: body.product_image_url || body.productImageUrl,
      businessName,
      objective,
      tone: brandKitContext.tone,
      layout: resolvedLayout,
    };

    const result = await this.runGenerate(body, context, tenantId, publicBaseUrl, brandKitContext.colors, {
      layout: layoutResult.layout,
      confidence: layoutResult.confidence,
      justification: layoutResult.justification,
    });

    if (result.creativeData) {
      result.creativeData.headline = sanitizeTypos(result.creativeData.headline);
      if (result.creativeData.subheadline) result.creativeData.subheadline = sanitizeTypos(result.creativeData.subheadline);
      if (result.creativeData.qualifier) result.creativeData.qualifier = sanitizeTypos(result.creativeData.qualifier);
      if (result.creativeData.offer_text) result.creativeData.offer_text = sanitizeTypos(result.creativeData.offer_text);
      if (result.creativeData.subtitle) result.creativeData.subtitle = sanitizeTypos(result.creativeData.subtitle);
      if (result.creativeData.subtitle_highlight) result.creativeData.subtitle_highlight = sanitizeTypos(result.creativeData.subtitle_highlight);
      if (result.creativeData.cta) result.creativeData.cta = sanitizeTypos(result.creativeData.cta);
      if (result.creativeData.benefits) result.creativeData.benefits = result.creativeData.benefits.map((b: string) => sanitizeTypos(b));
    }
    return result;
  }

  async regenerateCreative(tenantId: string, input: { assetId: string; feedback: string }, publicBaseUrl: string) {
    const asset = await this.repo(tenantId).findAssetById(input.assetId);
    if (!asset) throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset não encontrado');

    let savedContext: CreativeContext | undefined;
    let savedCreativeData: Record<string, unknown> | undefined;
    try {
      const meta = JSON.parse(asset.complianceNotes ?? '{}');
      savedContext = meta.context as CreativeContext;
      savedCreativeData = meta as Record<string, unknown>;
      const simpleFixMatch = input.feedback.match(/(?:corrigir|trocar|substituir|alterar)\s+['"](.+)['"]\s+(?:para|por)\s+['"](.+)['"]/i);
      if (simpleFixMatch) {
        const [, oldText, newText] = simpleFixMatch;
        let modified = false;
        const fields = ['headline', 'subheadline', 'qualifier', 'offer_text', 'subtitle', 'subtitle_highlight', 'cta'];
        for (const field of fields) {
          const val = savedCreativeData[field];
          if (typeof val === 'string' && val.includes(oldText)) { savedCreativeData[field] = val.replace(new RegExp(oldText, 'g'), newText); modified = true; }
        }
        if (savedCreativeData.benefits && Array.isArray(savedCreativeData.benefits)) {
          savedCreativeData.benefits = savedCreativeData.benefits.map(b => typeof b === 'string' ? b.replace(new RegExp(oldText, 'g'), newText) : b);
          modified = true;
        }
        if (modified) {
          const brandKitContext = await this.getBrandKitContext(tenantId);
          const creativeData: CreativeData = {
            layout: savedContext.layout || 'offer_burst',
            headline: String(savedCreativeData.headline || ''),
            subheadline: savedCreativeData.subheadline as string | undefined,
            qualifier: savedCreativeData.qualifier as string | undefined,
            offer_text: savedCreativeData.offer_text as string | undefined,
            subtitle: savedCreativeData.subtitle as string | undefined,
            subtitle_highlight: savedCreativeData.subtitle_highlight as string | undefined,
            benefits: Array.isArray(savedCreativeData.benefits) ? savedCreativeData.benefits as string[] : undefined,
            cta: savedCreativeData.cta as string | undefined,
            businessName: savedContext.businessName,
            includeLogo: true,
            brand_colors: { primary: brandKitContext.colors?.primary || '#EA580C', accent: brandKitContext.colors?.secondary || undefined },
          };
          const pngBuffer = await convertHTMLToPNG(creativeData, brandKitContext.colors);
          let imageUrl: string;
          if (process.env.R2_ENDPOINT && process.env.R2_PUBLIC_URL) {
            imageUrl = await this.deps.storage.uploadAsset(pngBuffer, `${randomUUID()}.png`);
          } else {
            const { fileName } = await savePNG(pngBuffer);
            imageUrl = `${publicBaseUrl.replace(/\/+$/, '')}/studio-assets/${fileName}`;
          }
          return { creativeData, imageUrl, fixType: 'direct_replace' };
        }
      }
    } catch { /* context not recoverable */ }

    if (!savedContext) throw new AppError(400, 'CONTEXT_NOT_FOUND', 'Contexto original do criativo não encontrado');
    if (!savedContext.layout) savedContext.layout = 'offer_burst';

    const prompt = buildRegeneratePrompt(savedContext, input.feedback, savedCreativeData as Record<string, string | string[] | undefined>);
    const raw = await this.deps.llm.chat([{ role: 'user', content: prompt }], { temperature: 0.9 });
    const copy = parseCreativeJSON(raw);
    for (const k of ['headline', 'subheadline', 'qualifier', 'offer_text', 'subtitle', 'subtitle_highlight', 'cta']) {
      if (copy[k]) copy[k] = sanitizeTypos(copy[k]);
    }
    if (copy.benefits && Array.isArray(copy.benefits)) copy.benefits = copy.benefits.map((b: string) => sanitizeTypos(b));

    const brandKitContext = await this.getBrandKitContext(tenantId);
    const creativeData: CreativeData = {
      layout: savedContext.layout,
      headline: copy.headline || '',
      subheadline: copy.subheadline,
      qualifier: copy.qualifier,
      offer_text: copy.offer_text,
      subtitle: copy.subtitle,
      subtitle_highlight: copy.subtitle_highlight,
      benefits: copy.benefits,
      cta: copy.cta,
      businessName: savedContext.businessName,
      includeLogo: true,
      brand_colors: { primary: brandKitContext.colors?.primary || '#EA580C', accent: brandKitContext.colors?.secondary || undefined },
      productImageUrl: savedContext.productImageUrl,
    };

    const pngBuffer = await convertHTMLToPNG(creativeData, brandKitContext.colors);
    let imageUrl: string;
    if (process.env.R2_ENDPOINT && process.env.R2_PUBLIC_URL) {
      imageUrl = await this.deps.storage.uploadAsset(pngBuffer, `${randomUUID()}.png`);
    } else {
      const { fileName } = await savePNG(pngBuffer);
      imageUrl = `${publicBaseUrl.replace(/\/+$/, '')}/studio-assets/${fileName}`;
    }
    const metadata = JSON.stringify({ ...creativeData, context: savedContext, feedback: input.feedback });
    const newAsset = await this.repo(tenantId).createAsset({
      tenantId,
      type: 'image',
      url: imageUrl,
      complianceStatus: 'pending_compliance',
      complianceNotes: metadata,
    });
    return {
      assetId: newAsset.id,
      imageUrl,
      creativeData: {
        layout: creativeData.layout,
        headline: creativeData.headline,
        subheadline: creativeData.subheadline,
        qualifier: creativeData.qualifier,
        offer_text: creativeData.offer_text,
        subtitle: creativeData.subtitle,
        subtitle_highlight: creativeData.subtitle_highlight,
        benefits: creativeData.benefits,
        cta: creativeData.cta,
      },
    };
  }

  async selectLayoutStandalone(tenantId: string, body: any) {
    const brandKitContext = await this.getBrandKitContext(tenantId);
    const result = await selectLayout({
      tenantId,
      briefing: { product: body.product, promise: body.promise, offer: body.offer, audience: body.audience, objective: body.objective },
      assets: { hasProductImage: body.hasProductImage, productImageUrl: body.productImageUrl || body.background_image_url, hasLogo: !!brandKitContext.colors?.logoUrl },
      brand: { primary_color: brandKitContext.colors?.primary || '#EA580C', accent_color: brandKitContext.colors?.secondary || undefined, brand_voice: brandKitContext.tone },
    });
    return {
      layout: result.layout,
      label: CREATIVE_LAYOUT_LABELS[result.layout],
      funnel_stage: CREATIVE_LAYOUT_FUNNEL_STAGE[result.layout],
      confidence: result.confidence,
      justification: result.justification,
      suggested_fields: result.suggested_fields,
    };
  }

  async previewPng(tenantId: string, body: any): Promise<Buffer> {
    const { businessName } = await this.getTenantContext(tenantId);
    const brandKitContext = await this.getBrandKitContext(tenantId);
    const creativeData = buildCreativeData({ layout: body.layout, body, businessName, brandColors: brandKitContext.colors });
    return convertHTMLToPNG(creativeData, brandKitContext.colors);
  }
}