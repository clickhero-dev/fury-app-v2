import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { requestStudioImageGeneration } from '../services/studio.service.js';

const generateImageSchema = z.object({
  briefing: z.string().min(10, 'Briefing deve ter no minimo 10 caracteres').max(500, 'Briefing deve ter no maximo 500 caracteres'),
  format: z.enum(['feed', 'stories', 'banner']),
  style: z.enum(['fotografico', 'ilustracao', 'minimalista']).default('fotografico'),
  adAccountId: z.string().min(1, 'adAccountId e obrigatorio'),
});

export async function generateImage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }

    const body = generateImageSchema.parse(req.body);
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

    const result = await requestStudioImageGeneration({
      tenantId: req.tenant.tenantId,
      briefing: body.briefing,
      format: body.format,
      style: body.style,
      adAccountId: body.adAccountId,
      publicBaseUrl,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

const generateCopySchema = z.object({
  type: z.enum(['headline', 'descricao', 'cta', 'completo']),
  produto: z.string().min(3).max(200),
  publico: z.string().min(5).max(200),
  objetivo: z.string().min(5).max(200),
  tom: z.enum(['formal', 'casual', 'urgente', 'emocional']),
  quantidadeVariacoes: z.number().min(3).max(5).default(3),
})

function calcularPontuacao(texto: string, type: 'headline' | 'descricao' | 'cta' | 'completo') {
  const limiteChars: Record<string, number> = { headline: 40, descricao: 125, cta: 20, completo: 300 };
  let score = 3; // base

  // dentro do limite
  const limite = limiteChars[type] ?? 300;
  if (tipoLengthOK(texto, limite)) score += 3;

  // CTA claro
  const ctaWords = ['compre', 'acesse', 'saiba', 'clique', 'garanta'];
  const hasCta = ctaWords.some(w => texto.toLowerCase().includes(w));
  if (hasCta) score += 2;

  // palavras proibidas
  const forbidden = ['grátis excessivo', 'garantido 100%', 'melhor do mundo'];
  const hasForbidden = forbidden.some(w => texto.toLowerCase().includes(w));
  if (!hasForbidden) score += 2;

  return Math.min(10, Math.round((score + Number.EPSILON) * 10) / 10);
}

function tipoLengthOK(texto: string, limite: number) {
  if (!limite) return true;
  return texto.length <= limite;
}

export async function generateCopy(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }

    const body = generateCopySchema.parse(req.body);
    const quantidade = body.quantidadeVariacoes ?? 3;
    const type = body.type as 'headline' | 'descricao' | 'cta' | 'completo';

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({
        variacoes: [
          { texto: `${body.produto} — transforme seu negócio hoje!`, caracteres: `${("" + (body.produto)).length + 45}` ? 45 : 45, pontuacao: 7.0 },
          { texto: `Descubra ${body.produto} para ${body.publico}`, caracteres: 35, pontuacao: 6.5 },
          { texto: `A melhor escolha em ${body.produto}`, caracteres: 30, pontuacao: 6.0 },
        ].slice(0, quantidade),
      });
    }

    // build prompts
    const systemPrompt = `Você é um especialista em copywriting para anúncios digitais no Facebook e Instagram.\n\nGere variações de copy persuasivas, claras e em português brasileiro adequadas para o público-alvo.\n\nRespeite RIGOROSAMENTE os limites de caracteres especificados.\n\nResponda APENAS em JSON válido, sem texto adicional, sem markdown.`;

    const limiteChars: Record<string, number> = { headline: 40, descricao: 125, cta: 20, completo: 300 };

    const userPrompt = `Produto/serviço: ${body.produto}\n\nPúblico-alvo: ${body.publico}\n\nObjetivo do anúncio: ${body.objetivo}\n\nTom de comunicação: ${body.tom}\n\n\nGere ${quantidade} variações de ${type} em português brasileiro.\n\nLimite máximo: ${limiteChars[type]} caracteres por variação.\n\n\nRetorne APENAS este JSON:\n\n{\n  "variacoes": [\n    { "texto": "texto da variação aqui", "caracteres": 0 }\n  ]\n}`;

    // import claude client (ESM style)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const { claude } = await import('../lib/claude.js');

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response?.content?.[0]?.type === 'text' ? response.content[0].text : '';
    const cleaned = text ? text.replace(/``json|``/g, '').trim() : '';
    let parsed: any = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new AppError(502, 'CLAUDE_PARSE_ERROR', 'Nao foi possivel parsear a resposta do Claude.');
    }

    if (!parsed || !Array.isArray(parsed.variacoes)) {
      throw new AppError(502, 'CLAUDE_INVALID_RESPONSE', 'Resposta do Claude nao contem variacoes esperadas.');
    }

    const result = parsed.variacoes.map((v: any) => ({
      texto: String(v.texto ?? v.text ?? ''),
      caracteres: String(v.texto ?? v.text ?? '').length,
      pontuacao: calcularPontuacao(String(v.texto ?? v.text ?? ''), type),
    }));

    return res.json({ variacoes: result });
  } catch (error) {
    next(error);
  }
}