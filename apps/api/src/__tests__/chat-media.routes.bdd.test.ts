/* Funcionalidade: rotas de mídia antes do proxy JSON.
 * Dado usuário autenticado, quando envia multipart/read, então o contrato público
 * permanece privado e a delegação só permite read/cleanup, não upload/ditado. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
vi.mock('../lib/ai-key-context.js', () => ({ runWithTenant: (_: string, fn: () => unknown) => fn() }));
import { ChatMediaController } from '../controllers/chat-media.controller.js';
import { createChatMediaRouter } from '../routes/chat-media.routes.js';
import { createDelegationGuard } from '../middleware/chat-delegation.middleware.js';
import { createChatDelegation } from '../lib/chat-delegation.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { AppError, errorHandler } from '../middleware/errorHandler.js';
const tenant = '11111111-1111-4111-8111-111111111111', userId = '22222222-2222-4222-8222-222222222222';
const conversation = '33333333-3333-4333-8333-333333333333', id = '44444444-4444-4444-8444-444444444444';
const identity = { userId, tenantId: tenant, email: 'test@example.test', role: 'admin' };
const secret = 'test-delegation-media-with-32-characters';
const bearer = jwt.sign(identity, process.env.JWT_SECRET!);
const delegated = createChatDelegation(identity, secret);
const base = `/api/chat/conversations/${conversation}/attachments`;
const attachment = { id, filename: 'imagem.png', mimeType: 'image/png', sizeBytes: 3 };
const attachments = { assertOwned: vi.fn(), upload: vi.fn(), download: vi.fn(), remove: vi.fn(), read: vi.fn(), cleanup: vi.fn(), cleanupDelegated: vi.fn() };
const transcription = { transcribe: vi.fn() }; const consume = vi.fn();
function app(options = {}) {
  const server = express(); server.use(express.json({ limit: '32kb' }));
  server.use(createDelegationGuard({ secret, repository: () => ({ consume }) }));
  server.use('/api/chat', authMiddleware, tenantMiddleware, createChatMediaRouter(new ChatMediaController(transcription as never, attachments as never), options));
  server.use((_req, res) => res.status(599).json({ proxy: true }));
  server.use(errorHandler); return server;
}
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.clearAllMocks(); attachments.assertOwned.mockResolvedValue(undefined);
  attachments.upload.mockResolvedValue({ attachments: [attachment] });
  attachments.download.mockResolvedValue({ attachment, bytes: Buffer.from('PNG') });
  attachments.remove.mockResolvedValue(undefined); attachments.cleanup.mockResolvedValue(undefined);
  attachments.read.mockResolvedValue({ readings: [{ attachmentId: id, filename: 'imagem.png', content: 'azul' }], failures: [] });
  transcription.transcribe.mockResolvedValue({ text: 'Olá' });
});

afterEach(() => { vi.restoreAllMocks(); });
describe('API mídia autenticada', () => {
  it('multipart audio retorna somente texto sem atravessar proxy JSON', async () => {
    const result = await request(app()).post('/api/chat/transcriptions').set('Authorization', `Bearer ${bearer}`).attach('audio', Buffer.from('audio'), 'voice.webm');
    expect(result.status).toBe(200); expect(result.body).toEqual({ text: 'Olá' });
    expect(transcription.transcribe).toHaveBeenCalledWith(tenant, expect.objectContaining({ buffer: Buffer.from('audio') }), expect.any(AbortSignal));
  });
  it('upload files responde 201 sem URL/path privado', async () => {
    const result = await request(app()).post(base).set('Authorization', `Bearer ${bearer}`).attach('files', Buffer.from('PNG'), 'imagem.png');
    expect(result.status).toBe(201); expect(result.body).toEqual({ attachments: [attachment] });
    expect(attachments.assertOwned).toHaveBeenCalledWith(tenant, userId, conversation);
  });
  it('download exige bearer e usa no-store + nosniff', async () => {
    const result = await request(app()).get(`${base}/${id}`).set('Authorization', `Bearer ${bearer}`);
    expect(result.status).toBe(200); expect(result.headers['content-type']).toContain('image/png');
    expect(result.headers['cache-control']).toBe('private, no-store'); expect(result.headers['x-content-type-options']).toBe('nosniff');
    expect(result.headers['content-security-policy']).toContain("default-src 'none'");
  });
  it('delete unitário e cleanup retornam 204', async () => {
    expect((await request(app()).delete(`${base}/${id}`).set('Authorization', `Bearer ${bearer}`)).status).toBe(204);
    expect((await request(app()).delete(base).set('Authorization', `Bearer ${bearer}`)).status).toBe(204);
  });
  it('400 para UUID/body inválido, ids duplicados e campo multipart errado', async () => {
    expect((await request(app()).get(`${base}/invalid`).set('Authorization', `Bearer ${bearer}`)).status).toBe(400);
    expect((await request(app()).post(`${base}/read`).set('Authorization', `Bearer ${bearer}`).send({ attachmentIds: [id, id], question: 'x' })).status).toBe(400);
    expect((await request(app()).post(`${base}/read`).set('Authorization', `Bearer ${bearer}`).send({ attachmentIds: [id], question: 'x', url: 'http://localhost' })).status).toBe(400);
    expect((await request(app()).post('/api/chat/transcriptions').set('Authorization', `Bearer ${bearer}`).attach('file', Buffer.from('x'), 'x')).status).toBe(400);
  });
  it('aceita três arquivos e rejeita o quarto, áudio >10MiB e total >60MiB', async () => {
    const send = () => request(app()).post(base).set('Authorization', `Bearer ${bearer}`);
    expect((await send().attach('files', Buffer.from('a'), 'a').attach('files', Buffer.from('b'), 'b').attach('files', Buffer.from('c'), 'c')).status).toBe(201);
    expect((await send().attach('files', Buffer.from('a'), 'a').attach('files', Buffer.from('b'), 'b').attach('files', Buffer.from('c'), 'c').attach('files', Buffer.from('d'), 'd')).status).toBe(413);
    expect((await request(app()).post('/api/chat/transcriptions').set('Authorization', `Bearer ${bearer}`).attach('audio', Buffer.alloc(10 * 1024 * 1024 + 1), 'large.wav')).status).toBe(413);
    expect((await send().attach('files', Buffer.alloc(31 * 1024 * 1024), 'a').attach('files', Buffer.alloc(31 * 1024 * 1024), 'b')).status).toBe(413);
  });
  it('401 sem bearer ou com token em URL, 403 sem tenant, 404 para dono errado', async () => {
    expect((await request(app()).get(`${base}/${id}`)).status).toBe(401);
    expect((await request(app()).get(`${base}/${id}?token=${bearer}`)).status).toBe(401);
    const missingTenant = jwt.sign({ ...identity, tenantId: '' }, process.env.JWT_SECRET!);
    expect((await request(app()).get(`${base}/${id}`).set('Authorization', `Bearer ${missingTenant}`)).status).toBe(403);
    attachments.assertOwned.mockRejectedValue(new AppError(404, 'NOT_FOUND', 'Conversa não encontrada.'));
    expect((await request(app()).post(base).set('Authorization', `Bearer ${bearer}`).attach('files', Buffer.from('x'), 'x')).status).toBe(404);
    expect(attachments.upload).not.toHaveBeenCalled();
  });
  it('429 por limite do usuário e timeout upstream sanitizado', async () => {
    const server = app({ maxRequestsPerMinute: 1 });
    await request(server).post('/api/chat/transcriptions').set('Authorization', `Bearer ${bearer}`).attach('audio', Buffer.from('x'), 'x');
    expect((await request(server).post('/api/chat/transcriptions').set('Authorization', `Bearer ${bearer}`).attach('audio', Buffer.from('x'), 'x')).status).toBe(429);
    transcription.transcribe.mockRejectedValue(new AppError(504, 'CHAT_MEDIA_TIMEOUT', 'Não foi possível processar a mídia. Tente novamente.'));
    expect((await request(app()).post('/api/chat/transcriptions').set('Authorization', `Bearer ${bearer}`).attach('audio', Buffer.from('x'), 'x')).status).toBe(504);
  });
  it('delegação permite read e cleanup sem consumir aprovação de ação externa', async () => {
    expect((await request(app()).post(`${base}/read`).set('Authorization', `Bearer ${delegated}`).send({ attachmentIds: [id], question: '' })).status).toBe(200);
    expect((await request(app()).delete(base).set('Authorization', `Bearer ${delegated}`)).status).toBe(204);
    expect(consume).not.toHaveBeenCalled();
    expect(attachments.cleanupDelegated).toHaveBeenCalledWith(tenant, userId, conversation);
    expect(attachments.cleanup).not.toHaveBeenCalled();
    expect(attachments.read).toHaveBeenCalledWith(tenant, userId, conversation, [id], '', expect.any(AbortSignal));
  });
  it('composition root monta mídia antes do proxy e imagem instala validadores', async () => {
    const { readFile } = await import('node:fs/promises');
    const routes = await readFile(new URL('../routes/index.ts', import.meta.url), 'utf8');
    expect(routes).toContain('createChatMediaRouter(controllers.chatMedia)');
    expect(routes.indexOf('createChatMediaRouter(controllers.chatMedia)')).toBeLessThan(routes.indexOf('createChatProxy({'));
    const di = await readFile(new URL('../di.ts', import.meta.url), 'utf8');
    expect(di).toContain('chatMedia: new ChatMediaController(');
    const dockerfile = await readFile(new URL('../../Dockerfile', import.meta.url), 'utf8');
    expect(dockerfile).toMatch(/apk add[^\n]+ffmpeg[^\n]+poppler-utils[^\n]+util-linux/);
  });
  it('delegação não dá upload, ditado, download nem remoção unitária', async () => {
    for (const [method, url] of [['post', base], ['post', '/api/chat/transcriptions'], ['get', `${base}/${id}`], ['delete', `${base}/${id}`]] as const) {
      expect((await request(app())[method](url).set('Authorization', `Bearer ${delegated}`)).status).toBe(403);
    }
  });
});
