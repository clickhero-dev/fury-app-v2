import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from './test-app.js';
import { setStatus } from '../lib/api-state.js';

describe('Cenário: isolamento das rotas durante a inicialização', () => {
  afterEach(() => setStatus('healthy'));
  it('bloqueia rotas públicas e preserva o health em falha crítica', async () => {
    setStatus('critical');
    const responses = await Promise.all([
      request(app).get('/api/lp/exemplo'),
      request(app).get('/api/public/brand-kit/exemplo'),
      request(app).get('/privacidade/exemplo'),
      request(app).get('/api/health'),
    ]);
    expect(responses.map((response) => response.status)).toEqual([503, 503, 503, 200]);
    expect(responses[3].body.status).toBe('critical');
  });
});
