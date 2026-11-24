import { SuggestionProviderError } from '../services/llms/suggestion-runner.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
const chat = vi.hoisted(() => vi.fn());
const find = vi.hoisted(() => vi.fn());
const transcribe = vi.hoisted(() => vi.fn());
vi.mock('../di.js', async () => {
  const { PlannerController } = await import('../controllers/planner.controller.js');
  const { PlannerCaptionSuggestionService } = await import('../services/planner/planner-caption-suggestion.service.js');
  return { controllers: { planner: new PlannerController({} as never, new PlannerCaptionSuggestionService({ chat }, tenant => ({ findAssetByUrl: (url: string) => find(tenant, url) }), { transcribe })) } };
});
import router from '../routes/planner.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';
const app = express(); app.use(express.json()); app.use('/planner', router); app.use(errorHandler);
function auth(tenantId: string | undefined = 't1') { return `Bearer ${jwt.sign({ userId: 'u1', tenantId, role: 'owner' }, process.env.JWT_SECRET!)}`; }
function send(body: object, authorization = auth()) { return request(app).post('/planner/posts/suggest-caption').set('Authorization', authorization).send(body); }
// Dado router real e provedor simulado, quando solicitar legenda, então respeita isolamento e contrato.
describe('BDD: rota real com serviço de legenda', () => {
  beforeEach(() => { vi.resetAllMocks(); process.env.R2_PUBLIC_URL = 'https://media.example.com'; chat.mockResolvedValue('{"caption":"Legenda"}'); find.mockImplementation(async (tenant: string) => tenant === 't1' ? { type: 'image' } : null); });
  it('Cenário: imagem própria → 200 visual', async () => {
    const res = await send({ imageUrl: 'https://media.example.com/a.png' });
    expect(res.status).toBe(200); expect(res.body.data).toEqual({ caption: 'Legenda', imageUsed: true });
  });
  it('Cenário: vídeo próprio → transcrição seguida de legenda', async () => {
    find.mockResolvedValue({ type: 'video' }); transcribe.mockResolvedValue('Promoção de flores');
    expect((await send({ videoUrl: 'https://media.example.com/v.mp4' })).status).toBe(200);
    expect(transcribe).toHaveBeenCalledTimes(1);
  });
  it('Cenário: outro tenant → 404 genérico sem provedor; tema permite fallback', async () => {
    const res = await send({ imageUrl: 'https://media.example.com/a.png' }, auth('t2'));
    expect(res.status).toBe(404); expect(chat).not.toHaveBeenCalled(); expect(transcribe).not.toHaveBeenCalled();
    const fallback = await send({ imageUrl: 'https://media.example.com/a.png', context: 'tema' }, auth('t2'));
    expect(fallback.body.data.imageUsed).toBe(false);
  });
  it.each([{}, { tenantId: 't2', context: 'tema' }, { context: ' ' }, { context: 'x'.repeat(5001) }, { imageUrl: 'http://media.example.com/a.png' }, { imageUrl: 'https://evil.example/a.png' }, { imageUrl: 'https://media.example.com/a.png', videoUrl: 'https://media.example.com/v.mp4' }])('Cenário: payload inválido → 400 sem provedor: %j', async body => {
    expect((await send(body)).status).toBe(400); expect(chat).not.toHaveBeenCalled(); expect(transcribe).not.toHaveBeenCalled();
  });
  it('Cenário: sem auth ou tenant → 401/403 sem provedor', async () => {
    expect((await send({ context: 'tema' }, '')).status).toBe(401);
    expect((await send({ context: 'tema' }, auth(''))).status).toBe(403);
    expect(chat).not.toHaveBeenCalled();
  });
  it('Cenário: timeout/erro de ambos modelos → 503 sanitizado', async () => {
    chat.mockRejectedValue(new SuggestionProviderError('timeout'));
    const res = await send({ context: 'tema' });
    expect(res.status).toBe(503); expect(JSON.stringify(res.body)).not.toContain('token-secret'); expect(chat).toHaveBeenCalledTimes(2);
  });
});
