import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { setStatus } from '../lib/api-state.js';

describe('startup gate HTTP', () => {
  it('bloqueia as rotas públicas que consultam o banco durante startup', async () => {
    setStatus('starting');
    for (const path of ['/api/lp/test', '/api/public/brand-kit/test', '/swagger.json']) {
      expect((await request(app).get(path)).status).toBe(503);
    }
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});
