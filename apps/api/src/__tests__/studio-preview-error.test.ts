import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));

import { CreativeStudioController } from '../controllers/creative-studio.controller.js';
import { errorHandler } from '../middleware/errorHandler.js';

describe('POST preview-png — falha no render', () => {
  it('responde 422 com mensagem fixa, sem o detalhe interno', async () => {
    const service = { previewPng: vi.fn().mockRejectedValue(new Error('ENOENT /var/app/storage/tenant-1/logo.png')) };
    const controller = new CreativeStudioController(service as never);
    const app = express();
    app.use(express.json());
    app.post('/preview', (req, _res, next) => { (req as never as { tenant: { tenantId: string } }).tenant = { tenantId: 't1' }; next(); }, controller.previewPng);
    app.use(errorHandler);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).post('/preview').send({ layout: 'editorial_headline' });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Não foi possível montar o preview com esses dados. Confira a imagem, o logo e os textos.');
    expect(JSON.stringify(res.body)).not.toContain('/var/app');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
