/*
Funcionalidade: consultar disponibilidade de vídeo sem ampliar delegação
Cenário: leitura do caminho exato usa identidade delegada sem aprovação
Dado usuário delegado, quando consulta GET options, então lê sem executar ação
Cenário: mutações e caminhos derivados continuam proibidos
Dado usuário delegado, quando envia POST options, então recebe 403 sem consumir aprovação
*/
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createChatDelegation, isChatToolPath } from '../lib/chat-delegation.js';
import { createDelegationGuard, getDelegatedUser } from '../middleware/chat-delegation.middleware.js';

const secret = 'test-video-options-secret-at-least-32-characters';
const user = { userId: 'u1', tenantId: 't1', role: 'admin', email: 'test@example.invalid' };
const token = createChatDelegation(user, secret);

function server() {
  const consume = vi.fn().mockResolvedValue(true);
  const app = express();
  app.use(express.json());
  app.use(createDelegationGuard({ secret, repository: () => ({ consume }) }));
  app.use((req, res) => res.json({ user: getDelegatedUser(req), enabled: false, videosRemaining: 0 }));
  const errorHandler: ErrorRequestHandler = (error: { statusCode?: number; code?: string }, _req, res, _next) => {
    res.status(error.statusCode ?? 500).json({ code: error.code });
  };
  app.use(errorHandler);
  return { app, consume };
}

describe('preflight de vídeo delegado', () => {
  it('permite leitura do caminho exato sem consumir aprovação', async () => {
    const { app, consume } = server();
    const response = await request(app).get('/api/studio/video/options').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user, enabled: false, videosRemaining: 0 });
    expect(consume).not.toHaveBeenCalled();
  });

  it.each(['post', 'patch', 'delete'] as const)('nega %s mesmo com aprovação fornecida', async method => {
    const { app, consume } = server();
    const response = await request(app)[method]('/api/studio/video/options')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Chat-Approval-Id', '11111111-1111-4111-8111-111111111111').send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CHAT_SCOPE_DENIED');
    expect(consume).not.toHaveBeenCalled();
  });

  it.each(['/api/studio/video/options/extra', '/api/studio/video/options-extra', '/api/studio/video/%6fptions',
    '/api/studio/video//options', '/api/studio/video/../options', '/api/studio/video/options\\extra'])('nega caminho derivado %s', path => {
    expect(isChatToolPath(path)).toBe(false);
  });
});
