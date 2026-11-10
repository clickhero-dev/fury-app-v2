/*
 * Funcionalidade: carregar a API privada de planos antes da guarda/proxy legado
 * Cenário: endpoints de planos pertencem ao router isolado e autenticado
 * Dado o router raiz da API
 * Quando o cliente solicita planos da conversa
 * Então o router de planos está montado antes da guarda global de delegação.
 */
import { expect, it, vi } from 'vitest';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import routes from '../routes/index.js';
import { chatDelegationGuard } from '../middleware/chat-delegation.middleware.js';

it('monta todos os métodos do plano antes da guarda global', () => {
  const stack = (routes as unknown as { stack: Array<{ handle?: unknown }> }).stack;
  const planIndex = stack.findIndex(layer => {
    const inner = (layer.handle as { stack?: Array<{ route?: { path?: string } }> } | undefined)?.stack;
    return inner?.some(route => route.route?.path === '/conversations/:conversationId/plans');
  });
  const guardIndex = stack.findIndex(layer => layer.handle === chatDelegationGuard);

  expect(planIndex).toBeGreaterThanOrEqual(0);
  expect(planIndex).toBeLessThan(guardIndex);
  const mountedRoutes = (stack[planIndex].handle as { stack: Array<{ route?: { path?: string; methods?: Record<string, boolean> } }> }).stack;
  const baseRoutes = mountedRoutes.filter(layer => layer.route?.path === '/conversations/:conversationId/plans').map(layer => layer.route?.methods);
  expect(baseRoutes).toEqual(expect.arrayContaining([expect.objectContaining({ get: true }), expect.objectContaining({ post: true })]));
  const planRoutes = mountedRoutes.filter(layer => layer.route?.path === '/conversations/:conversationId/plans/:planId').map(layer => layer.route?.methods);
  expect(planRoutes).toEqual(expect.arrayContaining([expect.objectContaining({ get: true }), expect.objectContaining({ patch: true })]));
});
