import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import { db, creativeAssets, tenants, clientGoals } from '@fury/db';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import * as studioController from '../controllers/studio.controller.js';
import { studioCopyService } from '../services/studio-copy.service.js';
import { deepseekService } from '../services/deepseek.service.js';
import { buildCreativePrompt, buildRegeneratePrompt, buildValidationPrompt, type CreativeContext } from '../prompts/creative-studio.prompt.js';
import { convertHTMLToPNG } from '../services/html-to-png.service.js';
import { studioAssetsDir } from '../lib/temp-storage.js';

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
  templateStyle: z.string().optional(),
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
  product: z.string().min(2),
  promise: z.string().min(2),
  offer: z.string().optional(),
  audience: z.string().min(2),
  hasProductImage: z.boolean().default(false),
  productImageUrl: z.string().url().optional(),
  adaptiveAnswers: z.record(z.string()).optional(),
});

async function savePNG(buffer: Buffer): Promise<{ fileName: string; filePath: string }> {
  console.log('=== STUDIO [1] PNG buffer size:', buffer?.length ?? 0);

  const dir = studioAssetsDir;
  if (!fs.existsSync(dir)) {
    console.log('=== STUDIO creating dir:', dir);
    fs.mkdirSync(dir, { recursive: true });
  }
  console.log('=== STUDIO [2] Dir exists:', fs.existsSync(dir));

  const fileName = `${randomUUID()}.png`;
  const filePath = join(dir, fileName);
  console.log('=== STUDIO [2] Saving to:', filePath);

  try {
    fs.writeFileSync(filePath, buffer);
    console.log('=== STUDIO [3] File saved OK, size:', fs.statSync(filePath).size);
  } catch (err) {
    console.error('=== STUDIO [3] SAVE FAILED:', err);
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

function parseCreativeJSON(raw: string) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

async function runGenerate(context: CreativeContext, productImageUrl: string | undefined, tenantId: string, publicBaseUrl: string) {
  const prompt = buildCreativePrompt(context);
  const raw = await deepseekService.chat([{ role: 'user', content: prompt }], { temperature: 0.8 });
  const creativeData = parseCreativeJSON(raw);

  const pngBuffer = await convertHTMLToPNG({
    headline: creativeData.headline,
    primary_text: creativeData.primary_text,
    cta: creativeData.cta,
    subheadline: creativeData.subheadline,
    layout: creativeData.layout,
    color_scheme: creativeData.color_scheme,
    productImageUrl,
    businessName: context.businessName,
  });
  const { fileName } = await savePNG(pngBuffer);
  const imageUrl = `${publicBaseUrl.replace(/\/+$/, '')}/studio-assets/${fileName}`;
  console.log('=== STUDIO [4] imageUrl:', imageUrl);

  const metadata = JSON.stringify({ ...creativeData, context });

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
      headline: creativeData.headline,
      primary_text: creativeData.primary_text,
      cta: creativeData.cta,
      subheadline: creativeData.subheadline,
      layout: creativeData.layout,
      color_scheme: creativeData.color_scheme,
    },
  };
}

router.post('/creative/generate', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = generateCreativeSchema.parse(req.body);
    const tenantId = (req as any).tenant?.tenantId as string;
    const publicBaseUrl = process.env.APP_URL ?? process.env.PUBLIC_BASE_URL ?? 'https://fury-app-v2-production.up.railway.app';

    const { businessName, objective } = await getTenantContext(tenantId);
    const adaptive = body.adaptiveAnswers ?? {};

    const context: CreativeContext = {
      product: adaptive.product || body.product,
      promise: adaptive.promise || body.promise,
      offer: adaptive.offer || body.offer,
      audience: adaptive.audience || body.audience,
      hasProductImage: body.hasProductImage,
      productImageUrl: body.productImageUrl,
      businessName,
      objective,
    };

    const result = await runGenerate(context, body.productImageUrl, tenantId, publicBaseUrl);
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
    const publicBaseUrl = process.env.APP_URL ?? process.env.PUBLIC_BASE_URL ?? 'https://fury-app-v2-production.up.railway.app';

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

    const prompt = buildRegeneratePrompt(savedContext, feedback);
    const raw = await deepseekService.chat([{ role: 'user', content: prompt }], { temperature: 0.9 });
    const creativeData = parseCreativeJSON(raw);

    const pngBuffer = await convertHTMLToPNG({
      headline: creativeData.headline,
      primary_text: creativeData.primary_text,
      cta: creativeData.cta,
      subheadline: creativeData.subheadline,
      layout: creativeData.layout,
      color_scheme: creativeData.color_scheme,
      productImageUrl: savedContext.productImageUrl,
      businessName: savedContext.businessName,
    });
    const { fileName } = await savePNG(pngBuffer);
    const imageUrl = `${publicBaseUrl.replace(/\/+$/, '')}/studio-assets/${fileName}`;
    console.log('=== STUDIO [4] regenerate imageUrl:', imageUrl);

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
        headline: creativeData.headline,
        primary_text: creativeData.primary_text,
        cta: creativeData.cta,
        subheadline: creativeData.subheadline,
        layout: creativeData.layout,
        color_scheme: creativeData.color_scheme,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: err.errors });
    next(err);
  }
});

export default router;