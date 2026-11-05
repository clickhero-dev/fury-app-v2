/*
# Language: pt-BR

Funcionalidade: telemetria de erros HTTP

  Cenário: rejeição de autenticação não vira exceção no PostHog
    Dado uma rota que rejeita requisição sem Authorization com 401
    Quando o error handler produz a resposta
    Então a resposta preserva o 401 e nenhuma exceção é enviada à telemetria

  Cenário: erro interno é enviado ao PostHog
    Dado uma rota que falha inesperadamente
    Quando o error handler produz a resposta
    Então a resposta é 500 e a exceção é enviada à telemetria
*/
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureServerException = vi.hoisted(() => vi.fn());

vi.mock('../lib/analytics.js', () => ({ captureServerException }));

import { AppError, errorHandler } from '../middleware/errorHandler.js';

describe('BDD: telemetria de erros HTTP', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Cenário: rejeição de autenticação não vira exceção no PostHog', async () => {
    const app = express();
    app.get('/protected', (_req, _res, next) => next(new AppError(401, 'UNAUTHORIZED', 'Missing or invalid authorization header')));
    app.use(errorHandler);

    const response = await request(app).get('/protected');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(captureServerException).not.toHaveBeenCalled();
  });

  it('Cenário: erro interno é enviado ao PostHog', async () => {
    const app = express();
    app.get('/broken', (_req, _res, next) => next(new Error('database unavailable')));
    app.use(errorHandler);

    const response = await request(app).get('/broken');

    expect(response.status).toBe(500);
    expect(captureServerException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'database unavailable' }),
      expect.objectContaining({ statusCode: 500, code: 'INTERNAL_SERVER_ERROR' }),
    );
  });
});
