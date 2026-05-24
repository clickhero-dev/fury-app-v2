import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { claude } from '../lib/claude.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import * as studioController from '../controllers/studio.controller.js';

const router = Router();

router.get('/assets', authMiddleware, tenantMiddleware, studioController.listAssets);
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

router.post('/generate-copy', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = generateCopySchema.parse(req.body);
    const type = body.type as CopyType;
    const quantidade = body.quantidadeVariacoes ?? 3;

    // Fallback/Mock se não houver chave
    if (!process.env.ANTHROPIC_API_KEY || process.env.META_USE_MOCK === 'true') {
      return res.json({
        variacoes: getMockVariations(body, quantidade),
      });
    }

    const limiteChars: Record<CopyType, number> = { headline: 40, descricao: 125, cta: 20, completo: 300 };
    const systemPrompt = `Você é um especialista em copywriting para anúncios digitais no Facebook e Instagram. Gere variações de copy persuasivas, claras e em português brasileiro. Respeite RIGOROSAMENTE os limites de caracteres especificados. Responda APENAS em JSON válido sem texto adicional.`;
    const userPrompt = `Produto: ${body.produto}\nPúblico: ${body.publico}\nObjetivo: ${body.objetivo}\nTom: ${body.tom}\n\nGere ${quantidade} variações de ${type} em português, limite máximo ${limiteChars[type]} caracteres.\n\nRetorne APENAS:\n{"variacoes": [{"texto": "..."}]}`;

    const response = await claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content0 = (response as any)?.content?.[0];
    const text = (content0 && typeof content0 === 'object' && 'text' in content0)
      ? String((content0 as any).text)
      : (typeof content0 === 'string' ? content0 : '');
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

router.post('/generate-image', authMiddleware, tenantMiddleware, studioController.generateImage);
router.post('/publish/:assetId', authMiddleware, tenantMiddleware, studioController.publishAsset);
router.post('/upload-to-meta', authMiddleware, tenantMiddleware, studioController.uploadToMeta);

export default router;