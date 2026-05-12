import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import studioRoutes from '../routes/studio.routes.js';

describe('POST /generate-copy', () => {
  let app: any;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.resetModules();

    app = express();
    app.use(bodyParser.json());
    // mock auth and tenant middlewares used by the route
    app.use((req: any, _res, next) => { req.user = { id: 'u' }; next(); });
    app.use((req: any, _res, next) => { req.tenant = { tenantId: 'test-tenant' }; next(); });
    app.use('/api', studioRoutes);
  });

  it('returns fallback when ANTHROPIC_API_KEY not set', async () => {
    const res = await request(app)
      .post('/api/generate-copy')
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
    expect(res.body.variacoes.length).toBe(3);
  });

  it('validates body and rejects bad inputs', async () => {
    const res = await request(app)
      .post('/api/generate-copy')
      .send({
        type: 'unknown',
        produto: 'x',
        publico: 'a',
        objetivo: 'b',
        tom: 'casual',
      })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('respects character limits in mocked claude response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';

    const mockResponse = JSON.stringify({
      variacoes: [
        { texto: 'Curto', caracteres: 5 },
        { texto: 'Muito muito muito longo texto que excede o limite para headline', caracteres: 80 },
        { texto: 'CTA compre agora', caracteres: 15 },
      ]
    });

    vi.mock('../lib/claude.js', () => ({
      claude: {
        messages: {
          create: async () => ({ content: [{ type: 'text', text: mockResponse }] }),
        },
      },
    }));

    const res = await request(app)
      .post('/api/generate-copy')
      .send({
        type: 'headline',
        produto: 'Produto Teste',
        publico: 'pequenas empresas',
        objetivo: 'aumentar vendas',
        tom: 'formal',
        quantidadeVariacoes: 3,
      })
      .expect(200);

    expect(res.body.variacoes.length).toBe(3);
    res.body.variacoes.forEach((v: any) => {
      expect(v).toHaveProperty('texto');
      expect(v).toHaveProperty('caracteres');
      expect(v).toHaveProperty('pontuacao');
    });
  });
});
