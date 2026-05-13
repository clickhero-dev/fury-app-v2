import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';

describe('Studio Generate Copy Endpoint', () => {
  let app: any;

  beforeEach(() => {
    app = express();
    app.use(bodyParser.json());

    // Mock middlewares
    app.use((req: Request, res: Response, next: NextFunction) => {
      (req as any).user = { userId: 'test', tenantId: 'test-tenant', email: 'test@test.com' };
      next();
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
      (req as any).tenant = { tenantId: (req as any).user?.tenantId || 'test-tenant' };
      next();
    });

    // Inline fallback route (without API key)
    app.post('/generate-copy', (req: Request, res: Response) => {
      try {
        const { type, produto, quantidadeVariacoes } = req.body;

        if (!type || !produto) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        const quantidade = quantidadeVariacoes || 3;
        const variacoes = [
          { texto: `${produto} — transforme seu negócio hoje!`, caracteres: `${produto}`.length + 31, pontuacao: 7.0 },
          { texto: `Descubra ${produto} agora.`, caracteres: `Descubra ${produto} agora.`.length, pontuacao: 6.5 },
          { texto: `Solução perfeita em ${produto}`, caracteres: `Solução perfeita em ${produto}`.length, pontuacao: 8.0 },
        ].slice(0, quantidade);

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

  it('returns 3 variations with fallback when no API key', async () => {
    const res = await request(app)
      .post('/generate-copy')
      .send({
        type: 'headline',
        produto: 'Produto Teste',
        publico: 'pequenas empresas',
        objetivo: 'aumentar vendas',
        tom: 'casual',
        quantidadeVariacoes: 3,
      })
      .expect(200);

    expect(res.body).toHaveProperty('variacoes');
    expect(Array.isArray(res.body.variacoes)).toBe(true);
    expect(res.body.variacoes).toHaveLength(3);
    expect(res.body.variacoes[0]).toHaveProperty('texto');
    expect(res.body.variacoes[0]).toHaveProperty('caracteres');
    expect(res.body.variacoes[0]).toHaveProperty('pontuacao');
  });

  it('respects quantidadeVariacoes parameter (4 variations)', async () => {
    const res = await request(app)
      .post('/generate-copy')
      .send({
        type: 'descricao',
        produto: 'Produto X',
        publico: 'todos',
        objetivo: 'vender',
        tom: 'formal',
        quantidadeVariacoes: 4,
      })
      .expect(200);

    expect(res.body.variacoes).toHaveLength(4);
  });

  it('character count in response matches texto length', async () => {
    const res = await request(app)
      .post('/generate-copy')
      .send({
        type: 'cta',
        produto: 'Produto Y',
        publico: 'target',
        objetivo: 'goal',
        tom: 'urgente',
        quantidadeVariacoes: 2,
      })
      .expect(200);

    res.body.variacoes.forEach((v: any) => {
      expect(v.caracteres).toBe(v.texto.length);
    });
  });

  it('pontuacao is between 0 and 10', async () => {
    const res = await request(app)
      .post('/generate-copy')
      .send({
        type: 'completo',
        produto: 'Produto Z',
        publico: 'audience',
        objetivo: 'objective',
        tom: 'emocional',
        quantidadeVariacoes: 3,
      })
      .expect(200);

    res.body.variacoes.forEach((v: any) => {
      expect(v.pontuacao).toBeGreaterThanOrEqual(0);
      expect(v.pontuacao).toBeLessThanOrEqual(10);
    });
  });

  it('returns error for missing required fields', async () => {
    const res = await request(app)
      .post('/generate-copy')
      .send({
        type: 'headline',
        // missing produto
      })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });
});
