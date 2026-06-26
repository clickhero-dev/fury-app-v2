import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import { db, creativeAssets, tenants, clientGoals, brandKits } from '@fury/db';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import * as studioController from '../controllers/studio.controller.js';
import { studioCopyService } from '../services/studio-copy.service.js';
import { deepseekService } from '../services/deepseek.service.js';
import { buildCreativePrompt, buildRegeneratePrompt, buildValidationPrompt, type CreativeContext } from '../prompts/creative-studio.prompt.js';
import { convertHTMLToPNG, type BrandColors } from '../services/html-to-png.service.js';
import type { CreativeData } from '../services/creative-data.js';
import { selectLayout } from '../services/layout-selector.service.js';
import type { CreativeLayout } from '@fury/shared';
import { CREATIVE_LAYOUT_LABELS, CREATIVE_LAYOUT_FUNNEL_STAGE } from '@fury/shared';
import { studioAssetsDir } from '../lib/temp-storage.js';
import { uploadAsset } from '../services/storage.service.js';

console.log('=== STUDIO studioAssetsDir:', studioAssetsDir);

const router = Router();

router.get('/storage-check', async (_req, res) => {
  const testFile = join(studioAssetsDir, 'test.txt');
  let writeOk = false;
  let error: string | null = null;
  try {
    if (!fs.existsSync(studioAssetsDir)) {
      fs.mkdirSync(studioAssetsDir, { recursive: true });
    }
    fs.writeFileSync(testFile, 'test');
    writeOk = fs.existsSync(testFile);
    fs.unlinkSync(testFile);
  } catch (err: any) {
    error = err.message;
  }
  res.json({
    studioAssetsDir,
    dirExists: fs.existsSync(studioAssetsDir),
    writeOk,
    error,
    files: fs.existsSync(studioAssetsDir) ? fs.readdirSync(studioAssetsDir).slice(0, 5) : [],
  });
});

router.get('/assets', authMiddleware, tenantMiddleware, studioController.listAssets);
router.delete('/assets/:assetId', authMiddleware, tenantMiddleware, studioController.deleteAsset);
router.get('/assets/:assetId', authMiddleware, tenantMiddleware, studioController.getAsset);
router.get('/assets/:assetId/compliance-status', authMiddleware, tenantMiddleware, studioController.getComplianceStatus);

const generateCopySchema = z.object({
  type: z.enum(['headline', 'descricao', 'cta', 'completo']),
  produto: z.string().min(3, 'Produto deve ter min 3 caracteres').max(200, 'Produto deve ter max 200 caracteres'),
  publico: z.string().min(5, 'Publico deve ter min 5 caracteres').max(200, 'Publico deve ter max 200 caracteres'),
  objetivo: z.string().min(5, 'Objetivo deve ter min 5 caracteres').max(200, 'Objetivo deve ter max 200 caracteres'),
  tom: z.enum(['formal', 'casual', 'urgente', 'emocional']),
  quantidadeVariacoes: z.number().int().min(3).max(5).default(3),
});

type CopyType = 'headline' | 'descricao' | 'cta' | 'completo';

function calcularPontuacao(texto: string, type: CopyType): number {
  const limiteChars: Record<CopyType, number> = { headline: 40, descricao: 125, cta: 20, completo: 300 };
  let score = 3; // base

  const limite = limiteChars[type] ?? 300;
  if (texto.length <= limite) score += 3;

  const ctaWords = ['compre', 'acesse', 'saiba', 'clique', 'garanta'];
  const hasCta = ctaWords.some(w => texto.toLowerCase().includes(w));
  if (hasCta) score += 2;

  const forbidden = ['grátis excessivo', 'garantido 100%', 'melhor do mundo'];
  const hasForbidden = forbidden.some(w => texto.toLowerCase().includes(w));
  if (!hasForbidden) score += 2;

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
    return {
      texto: item.texto,
      caracteres: item.texto.length,
      pontuacao: item.pontuacao,
    };
  });
}

// TODO Sprint 4: mover geração de copy para o wizard de campanhas
router.post('/generate-copy', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = generateCopySchema.parse(req.body);
    const type = body.type as CopyType;
    const quantidade = body.quantidadeVariacoes ?? 3;

    // Fallback/Mock se não houver chave
    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        variacoes: getMockVariations(body, quantidade),
      });
    }

    const limiteChars: Record<CopyType, number> = { headline: 40, descricao: 125, cta: 20, completo: 300 };
    const systemPrompt = `Você é um especialista em copywriting para anúncios digitais no Facebook e Instagram. Gere variações de copy persuasivas, claras e em português brasileiro. Respeite RIGOROSAMENTE os limites de caracteres especificados. Responda APENAS em JSON válido sem texto adicional.`;
    const userPrompt = `Produto: ${body.produto}\nPúblico: ${body.publico}\nObjetivo: ${body.objetivo}\nTom: ${body.tom}\n\nGere ${quantidade} variações de ${type} em português, limite máximo ${limiteChars[type]} caracteres.\n\nRetorne APENAS:\n{"variacoes": [{"texto": "..."}]}`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chatResponse = await openai.chat.completions.create({
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
      return res.json({ variacoes: getMockVariations(body, quantidade) });
    }

    if (!parsed?.variacoes || !Array.isArray(parsed.variacoes)) {
      return res.json({ variacoes: getMockVariations(body, quantidade) });
    }

    const result = parsed.variacoes.map((v: any) => {
      const texto = String(v.texto || v.text || '');
      return {
        texto,
        caracteres: texto.length,
        pontuacao: calcularPontuacao(texto, type),
      };
    });

    return res.json({ variacoes: result });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[GENERATE COPY ERROR]', error);
    return res.status(500).json({ error: 'Erro ao gerar copy' });
  }
});

// TODO Sprint 4: mover geração de copy para o wizard de campanhas
router.post('/copy/generate', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = generateCopySchema.parse(req.body);

    const input = {
      objective: (body as any).objetivo ?? (body as any).objective,
      product: (body as any).produto ?? (body as any).product,
      audience: (body as any).publico ?? (body as any).audience,
      tone: (body as any).tom ?? (body as any).tone,
      quantity: (body as any).quantidadeVariacoes ?? (body as any).quantity ?? 3,
    };

    const tenantId = (req as any).tenant?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant not found' });

    const result = await studioCopyService.generateAdCopy(input, tenantId);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: err.errors });
    next(err as any);
  }
});

router.post('/generate-image', authMiddleware, tenantMiddleware, studioController.generateImage);
router.post('/render-creative', authMiddleware, tenantMiddleware, studioController.renderCreative);
router.post('/publish/:assetId', authMiddleware, tenantMiddleware, studioController.publishAsset);
router.post('/upload-to-meta', authMiddleware, tenantMiddleware, studioController.uploadToMeta);

const validateContextSchema = z.object({
  product: z.string().min(1),
  promise: z.string().min(1),
  offer: z.string().optional(),
  audience: z.string().min(1),
});

router.post('/creative/validate-context', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validateContextSchema.parse(req.body);
    const tenantId = (req as any).tenant?.tenantId as string;
    const { businessName } = await getTenantContext(tenantId);

    const prompt = buildValidationPrompt({
      businessName,
      product: body.product,
      promise: body.promise,
      offer: body.offer,
      audience: body.audience,
    });

    const raw = await deepseekService.chat([{ role: 'user', content: prompt }], { temperature: 0.2, max_tokens: 600 });
    const result = parseCreativeJSON(raw);
    return res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: err.errors });
    next(err);
  }
});

const generateCreativeSchema = z.object({
  // ── Briefing (preservados para compatibilidade com o wizard atual) ───
  product:          z.string().min(2),
  promise:          z.string().min(2),
  offer:            z.string().optional(),
  audience:         z.string().min(2),
  adaptiveAnswers:  z.record(z.string()).optional(),

  // ── Layout (vem do Layout Selector Agent após Prompt 3) ──────────────
  // Opcional aqui: se ausente, o pipeline chama selectLayout() em runtime.
  // Se presente, pula a chamada ao agente e usa o valor direto.
  layout: z.enum([
    'editorial_headline',
    'offer_burst',
    'split_diagonal_product',
    'photo_immersive',
    'split_horizontal_photo',
  ]).optional(),

  // ── Textos do criativo ───────────────────────────────────────────────
  headline:           z.string().max(120).optional(),
  qualifier:          z.string().max(60).optional(),
  offer_text:         z.string().max(20).optional(),
  subheadline:        z.string().max(160).optional(),
  subtitle:           z.string().max(200).optional(),
  subtitle_highlight: z.string().max(30).optional(),
  benefits:           z.array(z.string().max(80)).max(4).optional(),
  cta:                z.string().max(24).optional(),
  cta_icon:           z.enum(['arrow', 'phone', 'whatsapp', 'none']).optional(),
  price_text:         z.string().max(20).optional(),

  // ── Imagens ──────────────────────────────────────────────────────────
  hasProductImage:      z.boolean().default(false),
  background_image_url: z.string().optional(),
  product_image_url:    z.string().optional(),
  hero_image_url:       z.string().optional(),
  productImageUrl:      z.string().optional(), // @deprecated — manter para não quebrar chamadas antigas

  // ── Visual ───────────────────────────────────────────────────────────
  tone:            z.enum(['institutional', 'energetic']).optional(),
  top_zone_color:  z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  highlight_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  includeLogo:     z.boolean().optional(),

  // Quando true, os textos vêm prontos do wizard (já curados pelo usuário) e o
  // pipeline NÃO chama o DeepSeek — renderiza direto. Garante que o resultado
  // final seja idêntico ao preview fiel (preview-png).
  skipCopy:        z.boolean().optional(),

  // Nota: templateStyle foi removido. O layout é determinado pelo
  // Layout Selector Agent (apps/api/src/services/layout-selector.service.ts).
  // Ver: docs/CREATIVE_STUDIO_ARCHETYPES.md
});

type GenerateCreativeBody = z.infer<typeof generateCreativeSchema>;

async function savePNG(buffer: Buffer): Promise<{ fileName: string; filePath: string }> {
  console.log('=== STUDIO [1] PNG buffer size:', buffer?.length ?? 0);

  const dir = studioAssetsDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const fileName = `${randomUUID()}.png`;
  const filePath = join(dir, fileName);

  try {
    fs.writeFileSync(filePath, buffer);
    console.log('=== STUDIO [3] File saved locally, size:', fs.statSync(filePath).size);
  } catch (err) {
    console.error('=== STUDIO [3] LOCAL SAVE FAILED:', err);
    throw err;
  }

  return { fileName, filePath };
}

async function getTenantContext(tenantId: string): Promise<{ businessName: string; objective: string }> {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  const goal = await db.query.clientGoals.findFirst({ where: eq(clientGoals.tenantId, tenantId) });
  return {
    businessName: tenant?.name ?? 'Meu Negócio',
    objective: goal?.objective ?? 'gerar leads',
  };
}

const VOICE_TONE_LABELS: Record<string, string> = {
  professional: 'Profissional',
  casual: 'Casual',
  urgent: 'Urgente',
  premium: 'Premium/Sofisticado',
};

async function getBrandKitContext(tenantId: string): Promise<{ tone?: string; colors?: BrandColors }> {
  const brandKit = await db.query.brandKits.findFirst({ where: eq(brandKits.tenantId, tenantId) });
  if (!brandKit) return {};

  return {
    tone: brandKit.voiceTone
      ? `Tom de voz da marca: ${VOICE_TONE_LABELS[brandKit.voiceTone]}. Escreva o copy seguindo esse tom.`
      : undefined,
    colors: brandKit.primaryColor || brandKit.logoUrl
      ? { primary: brandKit.primaryColor, secondary: brandKit.secondaryColor, logoUrl: brandKit.logoUrl }
      : undefined,
  };
}

function parseCreativeJSON(raw: string) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

// TEMPLATE_LAYOUT_MAP removido em 15/06/2026.
// O layout é agora determinado pelo Layout Selector Agent
// (apps/api/src/services/layout-selector.service.ts), com prioridade para
// body.layout quando o cliente já passa o arquétipo escolhido.
// Ver: docs/CREATIVE_STUDIO_ARCHETYPES.md

// A imagem única do wizard é roteada para o campo que cada arquétipo consome.
function imageFieldsForLayout(layout: CreativeLayout, imageUrl?: string): Pick<CreativeData, 'background_image_url' | 'product_image_url' | 'hero_image_url'> {
  if (!imageUrl) return {};
  if (layout === 'split_diagonal_product') return { product_image_url: imageUrl };
  if (layout === 'offer_burst') return { hero_image_url: imageUrl };
  return { background_image_url: imageUrl }; // editorial_headline, photo_immersive, split_horizontal_photo
}

// Monta o CreativeData a partir do body (textos curados) e, opcionalmente, do
// copy gerado pelo DeepSeek. Os campos do body têm prioridade. Compartilhado
// entre runGenerate e o endpoint preview-png (preview fiel = saída final).
function buildCreativeData(args: {
  layout: CreativeLayout;
  body: Partial<GenerateCreativeBody>;
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

async function runGenerate(
  body: GenerateCreativeBody,
  context: CreativeContext,
  tenantId: string,
  publicBaseUrl: string,
  brandColors?: BrandColors,
  layoutSelection?: { layout: CreativeLayout; confidence: number; justification: string },
) {
  // skipCopy: textos já curados pelo wizard → renderiza direto, sem LLM.
  let copy: Record<string, unknown> | undefined;
  if (!body.skipCopy) {
    const prompt = buildCreativePrompt(context);
    const raw = await deepseekService.chat([{ role: 'user', content: prompt }], { temperature: 0.8 });
    copy = parseCreativeJSON(raw);
  }

  const creativeData = buildCreativeData({
    layout: context.layout,
    body,
    businessName: context.businessName,
    brandColors,
    copy,
  });

  const pngBuffer = await convertHTMLToPNG(creativeData, brandColors);
  let imageUrl: string;
  if (process.env.R2_ENDPOINT && process.env.R2_PUBLIC_URL) {
    const fileName = `${randomUUID()}.png`;
    imageUrl = await uploadAsset(pngBuffer, fileName);
    console.log('=== STUDIO [4] imageUrl (R2):', imageUrl);
  } else {
    const { fileName } = await savePNG(pngBuffer);
    imageUrl = `${publicBaseUrl.replace(/\/+$/, '')}/studio-assets/${fileName}`;
    console.log('=== STUDIO [4] imageUrl (local):', imageUrl);
  }

  const metadata = JSON.stringify({ ...creativeData, context, layoutSelection });

  const [asset] = await db.insert(creativeAssets).values({
    tenantId,
    type: 'image',
    url: imageUrl,
    complianceStatus: 'pending_compliance',
    complianceNotes: metadata,
  }).returning();

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

router.post('/creative/generate', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = generateCreativeSchema.parse(req.body);
    const tenantId = (req as any).tenant?.tenantId as string;
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL || `https://${req.get('host')}`;

    const { businessName, objective } = await getTenantContext(tenantId);
    const brandKitContext = await getBrandKitContext(tenantId);
    const adaptive = body.adaptiveAnswers ?? {};

    const product = adaptive.product || body.product;
    const promise = adaptive.promise || body.promise;
    const offer = adaptive.offer || body.offer;
    const audience = adaptive.audience || body.audience;

    // 1. Resolver o layout pelo Layout Selector Agent (DeepSeek, temp 0.3).
    //    body.layout tem prioridade sobre o agente (permite override manual).
    const layoutResult = await selectLayout({
      tenantId,
      briefing: { product, promise, offer, audience },
      assets: {
        hasProductImage: body.hasProductImage,
        productImageUrl: body.product_image_url || body.productImageUrl,
        hasLogo: !!brandKitContext.colors?.logoUrl,
      },
      brand: {
        primary_color: brandKitContext.colors?.primary || '#EA580C',
        accent_color: brandKitContext.colors?.secondary || undefined,
        brand_voice: brandKitContext.tone,
      },
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

    const result = await runGenerate(body, context, tenantId, publicBaseUrl, brandKitContext.colors, {
      layout: layoutResult.layout,
      confidence: layoutResult.confidence,
      justification: layoutResult.justification,
    });
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: err.errors });
    next(err);
  }
});

router.post('/creative/regenerate', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { assetId, feedback } = z.object({ assetId: z.string().uuid(), feedback: z.string().min(1) }).parse(req.body);
    const tenantId = (req as any).tenant?.tenantId as string;
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL || `https://${req.get('host')}`;

    const asset = await db.query.creativeAssets.findFirst({
      where: eq(creativeAssets.id, assetId),
    });

    if (!asset || asset.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Asset não encontrado' });
    }

    let savedContext: CreativeContext | undefined;
    try {
      const meta = JSON.parse(asset.complianceNotes ?? '{}');
      savedContext = meta.context as CreativeContext;
    } catch {
      // context not recoverable
    }

    if (!savedContext) {
      return res.status(400).json({ error: 'Contexto original do criativo não encontrado' });
    }

    // Assets antigos (layouts descontinuados) não têm arquétipo novo no contexto.
    // Usa um default até o usuário reescolher — evita prompt com layout indefinido.
    if (!savedContext.layout) {
      savedContext.layout = 'offer_burst';
    }

    const prompt = buildRegeneratePrompt(savedContext, feedback);
    const raw = await deepseekService.chat([{ role: 'user', content: prompt }], { temperature: 0.9 });
    const copy = parseCreativeJSON(raw);

    const brandKitContext = await getBrandKitContext(tenantId);

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
      brand_colors: {
        primary: brandKitContext.colors?.primary || '#EA580C',
        accent: brandKitContext.colors?.secondary || undefined,
      },
      productImageUrl: savedContext.productImageUrl, // @deprecated — compat renderer legado
    };

    const pngBuffer = await convertHTMLToPNG(creativeData, brandKitContext.colors);
    let imageUrl: string;
    if (process.env.R2_ENDPOINT && process.env.R2_PUBLIC_URL) {
      const fileName = `${randomUUID()}.png`;
      imageUrl = await uploadAsset(pngBuffer, fileName);
      console.log('=== STUDIO [4] regenerate imageUrl (R2):', imageUrl);
    } else {
      const { fileName } = await savePNG(pngBuffer);
      imageUrl = `${publicBaseUrl.replace(/\/+$/, '')}/studio-assets/${fileName}`;
      console.log('=== STUDIO [4] regenerate imageUrl (local):', imageUrl);
    }

    const metadata = JSON.stringify({ ...creativeData, context: savedContext, feedback });

    const [newAsset] = await db.insert(creativeAssets).values({
      tenantId,
      type: 'image',
      url: imageUrl,
      complianceStatus: 'pending_compliance',
      complianceNotes: metadata,
    }).returning();

    return res.status(201).json({
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
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: err.errors });
    next(err);
  }
});

// Layout Selector standalone — o wizard consome para sugerir o arquétipo antes
// de gerar o criativo. Usa o brand_kit do tenant (scoping rigoroso por tenantId).
const selectLayoutSchema = z.object({
  product: z.string().min(1),
  promise: z.string().min(1),
  offer: z.string().optional(),
  audience: z.string().min(1),
  objective: z.enum(['awareness', 'consideration', 'conversion', 'content']).optional(),
  hasProductImage: z.boolean().default(false),
  productImageUrl: z.string().optional(),
  background_image_url: z.string().optional(),
});

router.post('/select-layout', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = selectLayoutSchema.parse(req.body);
    const tenantId = (req as any).tenant?.tenantId as string;

    const brandKitContext = await getBrandKitContext(tenantId);

    const result = await selectLayout({
      tenantId,
      briefing: {
        product: body.product,
        promise: body.promise,
        offer: body.offer,
        audience: body.audience,
        objective: body.objective,
      },
      assets: {
        hasProductImage: body.hasProductImage,
        productImageUrl: body.productImageUrl || body.background_image_url,
        hasLogo: !!brandKitContext.colors?.logoUrl,
      },
      brand: {
        primary_color: brandKitContext.colors?.primary || '#EA580C',
        accent_color: brandKitContext.colors?.secondary || undefined,
        brand_voice: brandKitContext.tone,
      },
    });

    return res.json({
      layout: result.layout,
      label: CREATIVE_LAYOUT_LABELS[result.layout],
      funnel_stage: CREATIVE_LAYOUT_FUNNEL_STAGE[result.layout],
      confidence: result.confidence,
      justification: result.justification,
      suggested_fields: result.suggested_fields,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: err.errors });
    next(err);
  }
});

// Preview fiel (Estratégia A): renderiza o PNG com os campos atuais do wizard
// SEM chamar o LLM e SEM salvar (R2/DB). O frontend usa <img> com debounce.
const previewCreativeSchema = z.object({
  layout: z.enum([
    'editorial_headline',
    'offer_burst',
    'split_diagonal_product',
    'photo_immersive',
    'split_horizontal_photo',
  ]),
  headline:           z.string().max(120).optional(),
  qualifier:          z.string().max(60).optional(),
  offer_text:         z.string().max(20).optional(),
  subheadline:        z.string().max(160).optional(),
  subtitle:           z.string().max(200).optional(),
  subtitle_highlight: z.string().max(30).optional(),
  benefits:           z.array(z.string().max(80)).max(4).optional(),
  cta:                z.string().max(24).optional(),
  cta_icon:           z.enum(['arrow', 'phone', 'whatsapp', 'none']).optional(),
  price_text:         z.string().max(20).optional(),
  background_image_url: z.string().optional(),
  product_image_url:    z.string().optional(),
  hero_image_url:       z.string().optional(),
  productImageUrl:      z.string().optional(),
  tone:            z.enum(['institutional', 'energetic']).optional(),
  top_zone_color:  z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  highlight_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  includeLogo:     z.boolean().optional(),
});

router.post('/preview-png', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = previewCreativeSchema.parse(req.body);
    const tenantId = (req as any).tenant?.tenantId as string;

    const { businessName } = await getTenantContext(tenantId);
    const brandKitContext = await getBrandKitContext(tenantId);

    const creativeData = buildCreativeData({
      layout: body.layout,
      body,
      businessName,
      brandColors: brandKitContext.colors,
    });

    let pngBuffer: Buffer;
    try {
      pngBuffer = await convertHTMLToPNG(creativeData, brandKitContext.colors);
    } catch (renderErr) {
      // Falta de asset obrigatório (foto/logo) — o front mostra orientação.
      return res.status(422).json({ error: 'preview_unavailable', message: (renderErr as Error).message });
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(pngBuffer);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: err.errors });
    next(err);
  }
});

export default router;