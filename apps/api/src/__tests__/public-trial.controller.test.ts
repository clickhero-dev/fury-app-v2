import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { PublicTrialController } from '../controllers/public-trial.controller.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { isTrialOriginAllowed } from '../routes/public-trial.routes.js';

describe('POST /api/public/trial/signup', () => {
  function createApp() {
    const service = { signup: vi.fn().mockResolvedValue(undefined), access: vi.fn() };
    const app = express();
    app.use(express.json({ limit: '4kb' }));
    app.post('/api/public/trial/signup', new PublicTrialController(service as any).signup);
    app.post('/api/public/trial/access', new PublicTrialController(service as any).access);
    app.use(errorHandler);
    return { app, service };
  }

  it('retorna o contrato de acesso temporário para uma conta nova', async () => {
    const { app, service } = createApp();
    service.signup.mockResolvedValue({ created: true, redirectUrl: 'https://app.example/trial/acesso#token=opaque' });
    const response = await request(app).post('/api/public/trial/signup').send({ name: 'Ana', email: 'ANA@example.com' });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ created: true, redirect_url: 'https://app.example/trial/acesso#token=opaque', message: 'Cadastro criado com sucesso.' });
    expect(service.signup).toHaveBeenCalledWith({ name: 'Ana', email: 'ana@example.com' });
  });

  it('informa EMAIL_JA_CADASTRADO sem expor dados da conta', async () => {
    const { app, service } = createApp();
    service.signup.mockResolvedValue({ created: false, error: 'EMAIL_JA_CADASTRADO' });
    const response = await request(app).post('/api/public/trial/signup').send({ name: 'Ana', email: 'ana@example.com' });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ erro: 'EMAIL_JA_CADASTRADO' });
  });

  it('retorna 400 para payload inválido e não chama o serviço', async () => {
    const { app, service } = createApp();
    const response = await request(app).post('/api/public/trial/signup').send({ name: '', email: 'bad', password: 'secret' });
    expect(response.status).toBe(400);
    expect(service.signup).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  it('troca token válido pela sessão e mantém cache privado', async () => {
    const { app, service } = createApp();
    service.access.mockResolvedValue({ token: 'access', refreshToken: 'refresh', user: { id: 'u' } });
    const response = await request(app).post('/api/public/trial/access').send({ token: 'a'.repeat(64) });
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(service.access).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('rejeita token inexistente ou com formato inválido sem chamar o serviço', async () => {
    const { app, service } = createApp();
    const response = await request(app).post('/api/public/trial/access').send({ token: 'not-a-token' });
    expect(response.status).toBe(400);
    expect(service.access).not.toHaveBeenCalled();
  });

  it('não cacheia respostas de validação', async () => {
    const { app } = createApp();
    const response = await request(app).post('/api/public/trial/signup').send({ email: 'bad' });
    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('aplica allowlist de origem somente quando configurada e quando Origin é enviado', () => {
    expect(isTrialOriginAllowed(undefined, 'https://forms.example')).toBe(true);
    expect(isTrialOriginAllowed('https://forms.example', 'https://forms.example,https://another.example')).toBe(true);
    expect(isTrialOriginAllowed('https://evil.example', 'https://forms.example')).toBe(false);
  });
});
