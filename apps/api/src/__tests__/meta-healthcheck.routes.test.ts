// =============================================================================
// BDD — Proteção HTTP dos endpoints do healthcheck Meta
/*
# Language: pt-BR

Funcionalidade: Restringir healthchecks ao superadmin

  Cenário: chamada sem autenticação recebe 401
    Dado que uma pessoa não autenticada acessa o endpoint
    Quando solicita a lista de usuários de Healthchecks
    Então recebe UNAUTHORIZED

  Cenário: usuário autenticado sem papel superadmin recebe 403
    Dado usuário autenticado com role owner
    Quando solicita a lista de usuários de Healthchecks
    Então recebe FORBIDDEN e o controller não é chamado

  Cenário: superadmin autenticado pode listar usuários
    Dado usuário autenticado com role superadmin
    Quando solicita a lista de usuários de Healthchecks
    Então recebe a lista client-safe
*/
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const { listUsers, genericControllers } = vi.hoisted(() => {
  const listUsers = vi.fn((_req: any, res: any) => res.json({ success: true, data: [] }));
  const inertHandler = (_req: any, res: any) => res.json({ success: true, data: {} });
  const genericControllers = new Proxy({}, { get: (_target, name: string) => name === 'metaHealthchecks'
    ? { listUsers, getLatest: inertHandler, run: inertHandler }
    : new Proxy({}, { get: () => inertHandler }) });
  return { listUsers, genericControllers };
});

vi.mock('../di.js', () => ({ controllers: genericControllers }));

import routes from '../routes/superadmin.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', routes);
  app.use(errorHandler);
  return app;
}

function authToken(role: string) {
  return jwt.sign({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@example.com', role }, process.env.JWT_SECRET!);
}

describe('BDD: endpoints HTTP Healthchecks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Cenário: sem autenticação responde 401', async () => {
    const response = await request(buildApp()).get('/admin/healthchecks/users');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('Cenário: papel diferente de superadmin responde 403', async () => {
    const response = await request(buildApp()).get('/admin/healthchecks/users').set('Authorization', `Bearer ${authToken('owner')}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('Cenário: superadmin acessa a lista client-safe', async () => {
    const response = await request(buildApp()).get('/admin/healthchecks/users').set('Authorization', `Bearer ${authToken('superadmin')}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(listUsers).toHaveBeenCalledOnce();
  });
});
