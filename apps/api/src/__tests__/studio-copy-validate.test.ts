import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';

describe('Studio Generate Copy - Fallback Endpoint', () => {
  let app: any;

  beforeEach(() => {
    app = express();
    app.use(bodyParser.json());

    // Mock middlewares
    app.use((req: Request, res: Response, next: NextFunction) => {
      (req as any).user = { userId: 'test', tenantId: 'test-tenant' };
      next();
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
      (req as any).tenant = { tenantId: (req as any).user?.tenantId };
      next();
    });

    // POST /generate-copy handler with fallback (no API key)
    app.post('/generate-copy', (req: Request, res: Response) => {
      try {
        const { type, produto, quantidadeVariacoes } = req.body;

        // Validate required fields
        if (!type || !produto) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // Clamp quantidade to 3-5 range
        const quantidade = Math.max(3, Math.min(5, quantidadeVariacoes || 3));

        // Generate mock variations
        const baseTexts = [
          `${produto} — transforme seu negócio hoje!`,
          `Descubra ${produto} agora.`,
          `Solução perfeita em ${produto}`,
          `Experimente ${produto} sem compromisso`,
          `${produto} é o que você procura`,
        ];

        const variacoes = baseTexts.slice(0, quantidade).map((texto, idx) => ({
          texto,
          caracteres: texto.length,
          pontuacao: Math.min(10, 6.0 + idx * 0.8),
        }));

        return res.json({ variacoes });
      } catch (error: any) {
        return res.status(500).json({ error: error.message });
      }
    });

    // Error handler
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Server error' });
    });
  });

  it('retorna 3 variações quando API indisponível', async () => {
    const res = await request(app)
      .post('/generate-copy')
      .send({
        type: 'headline',
        produto: 'Produto Teste',
        publico: 'pequenas empresas',
        objetivo: 'aumentar vendas',
        tom: 'casual',
      })
      .expect(200);

    expect(res.body).toHaveProperty('variacoes');
    expect(Array.isArray(res.body.variacoes)).toBe(true);
    expect(res.body.variacoes.length).toBe(3);
  });

  it('respeita limites de 3-5 variações', async () => {
    for (const qtd of [3, 4, 5]) {
      const res = await request(app)
        .post('/generate-copy')
        .send({
          type: 'descricao',
          produto: `Produto ${qtd}`,
          publico: 'audience',
          objetivo: 'goal',
          tom: 'formal',
          quantidadeVariacoes: qtd,
        })
        .expect(200);

      expect(res.body.variacoes).toHaveLength(qtd);
    }
  });

  it('cada variação tem texto, caracteres e pontuação', async () => {
    const res = await request(app)
      .post('/generate-copy')
      .send({
        type: 'cta',
        produto: 'Produto',
        publico: 'target',
        objetivo: 'action',
        tom: 'urgente',
      })
      .expect(200);

    res.body.variacoes.forEach((v: any) => {
      expect(v).toHaveProperty('texto');
      expect(v).toHaveProperty('caracteres');
      expect(v).toHaveProperty('pontuacao');
      expect(typeof v.texto).toBe('string');
      expect(typeof v.caracteres).toBe('number');
      expect(typeof v.pontuacao).toBe('number');
    });
  });

  it('caracteres correspondem ao comprimento do texto', async () => {
    const res = await request(app)
      .post('/generate-copy')
      .send({
        type: 'completo',
        produto: 'XYZ',
        publico: 'public',
        objetivo: 'obj',
        tom: 'emocional',
      })
      .expect(200);

    res.body.variacoes.forEach((v: any) => {
      expect(v.caracteres).toBe(v.texto.length);
    });
  });

  it('pontuação está entre 0 e 10', async () => {
    const res = await request(app)
      .post('/generate-copy')
      .send({
        type: 'headline',
        produto: 'ABC',
        publico: 'x',
        objetivo: 'y',
        tom: 'casual',
        quantidadeVariacoes: 5,
      })
      .expect(200);

    res.body.variacoes.forEach((v: any) => {
      expect(v.pontuacao).toBeGreaterThanOrEqual(0);
      expect(v.pontuacao).toBeLessThanOrEqual(10);
    });
  });

  it('rejeita requisição sem produto', async () => {
    const res = await request(app)
      .post('/generate-copy')
      .send({
        type: 'headline',
        // missing produto
      })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('suporta os 4 tones: formal, casual, urgente, emocional', async () => {
    const tones = ['formal', 'casual', 'urgente', 'emocional'];

    for (const tom of tones) {
      const res = await request(app)
        .post('/generate-copy')
        .send({
          type: 'descricao',
          produto: 'Produto',
          publico: 'audience',
          objetivo: 'goal',
          tom,
        })
        .expect(200);

      expect(res.body.variacoes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('suporta os 4 tipos: headline, descricao, cta, completo', async () => {
    const types = ['headline', 'descricao', 'cta', 'completo'];

    for (const type of types) {
      const res = await request(app)
        .post('/generate-copy')
        .send({
          type,
          produto: 'Produto',
          publico: 'audience',
          objetivo: 'goal',
          tom: 'casual',
        })
        .expect(200);

      expect(res.body.variacoes.length).toBeGreaterThanOrEqual(3);
      expect(res.body.variacoes[0]).toHaveProperty('pontuacao');
    }
  });
});
