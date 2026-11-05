/*
# Language: pt-BR

Funcionalidade: POST /planner/posts/suggest-caption

  Cenário: usuário autenticado gera por tema
    Dado um tenant autenticado e um tema válido
    Quando solicita uma legenda
    Então recebe 200 com caption transitória

  Cenário: corpo inválido ou sem autenticação
    Dado um corpo vazio ou uma request sem token
    Quando solicita uma legenda
    Então recebe respectivamente 400 e 401 sem chamar o serviço
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const suggest = vi.hoisted(() => vi.fn());
vi.mock('../di.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  const { PlannerController } = await import('../controllers/planner.controller.js');
  return {
    ...actual,
    controllers: { ...actual.controllers, planner: new PlannerController({} as never, { suggest } as never) },
  };
});

import plannerRoutes from '../routes/planner.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

function app() {
  const result = express();
  result.use(express.json());
  result.use('/api/planner', plannerRoutes);
  result.use(errorHandler);
  return result;
}
function token() {
  return jwt.sign({ userId: 'u1', tenantId: 'tenant-1', email: 'u@example.com', role: 'owner' }, process.env.JWT_SECRET ?? 'test-jwt-secret');
}

describe('BDD: POST /api/planner/posts/suggest-caption', () => {
  beforeEach(() => { vi.clearAllMocks(); suggest.mockResolvedValue({ caption: 'Legenda sugerida.', imageUsed: false }); });

  it('Cenário: usuário autenticado gera por tema → 200', async () => {
    const res = await request(app()).post('/api/planner/posts/suggest-caption')
      .set('Authorization', `Bearer ${token()}`).send({ context: 'lançamento' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { caption: 'Legenda sugerida.', imageUsed: false } });
    expect(suggest).toHaveBeenCalledWith('tenant-1', { context: 'lançamento' });
  });

  it('Cenário: corpo vazio ou sem autenticação → 400 / 401 sem serviço', async () => {
    const invalid = await request(app()).post('/api/planner/posts/suggest-caption').set('Authorization', `Bearer ${token()}`).send({});
    expect(invalid.status).toBe(400);
    const anonymous = await request(app()).post('/api/planner/posts/suggest-caption').send({ context: 'tema' });
    expect(anonymous.status).toBe(401);
    expect(suggest).not.toHaveBeenCalled();
  });
});
