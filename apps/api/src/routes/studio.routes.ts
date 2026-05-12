import { Router } from 'express';
import { z } from 'zod';
import { claude } from '../lib/claude.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

const generateCopySchema = z.object({
  type: z.enum(['headline', 'descricao', 'cta', 'completo']),
  produto: z.string().min(3).max(200),
  publico: z.string().min(5).max(200),
  objetivo: z.string().min(5).max(200),
  tom: z.enum(['formal', 'casual', 'urgente', 'emocional']),
  quantidadeVariacoes: z.number().min(3).max(5).default(3),
});

router.post('/generate-copy', authMiddleware, tenantMiddleware, async (req: any, res: any) => {
  try {
    const body = generateCopySchema.parse(req.body);

    // Fallback/Mock se não houver chave
    if (!process.env.ANTHROPIC_API_KEY || process.env.META_USE_MOCK === 'true') {
      return res.json({
        variacoes: [
          { texto: `${body.produto} — Sua melhor escolha!`, caracteres: 30, pontuacao: 8.5 },
          { texto: `Aproveite ${body.produto} agora.`, caracteres: 28, pontuacao: 7.0 },
          { texto: `Solução ideal para ${body.publico}`, caracteres: 35, pontuacao: 9.0 }
        ].slice(0, body.quantidadeVariacoes)
      });
    }

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: "Você é um copywriter expert. Responda apenas com JSON.",
      messages: [{ role: 'user', content: `Gere ${body.quantidadeVariacoes} variações de ${body.type} para ${body.produto}.` }]
    });

    const text = response.content[0].text;
    res.json(JSON.parse(text));
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao gerar copy' });
  }
});

// Mantendo a rota de imagem que já estava lá
router.post('/generate-image', authMiddleware, tenantMiddleware, async (req, res) => {
    // Sua lógica de imagem aqui...
    res.json({ message: "Rota de imagem ativa" });
});

export default router;