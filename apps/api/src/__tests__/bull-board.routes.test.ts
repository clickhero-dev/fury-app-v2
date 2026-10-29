import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

/*
  Funcionalidade: registrar as filas de background no Bull Board

  Cenário: todas as filas BullMQ do Fury aparecem no painel
    Dado que o Bull Board é inicializado
    Quando conecta os adapters às filas conhecidas
    Então cada fila de negócio tem uma entrada no painel

  Cenário: filas aparecem nos grupos de domínio corretos
    Dado que o painel registra adapters para as filas de negócio
    Quando o Bull Board abre o overview
    Então fury-engine também fica em ady, leads e publish-due ficam em meta, e Google segue isolado em google

  Cenário: operações de reexecução estão habilitadas
    Dado que o superadmin administra as filas
    Quando abre os detalhes de uma fila
    Então pode repetir jobs falhos e concluídos

  Cenário: somente superadmin acessa o painel
    Dado uma pessoa sem credenciais ou com papel comum
    Quando solicita o Bull Board
    Então recebe 401 ou 403
*/

const { setBasePath, registeredQueueNames, adapterOptions, boardRegistrations, metricRecorders, historyProviders } = vi.hoisted(() => ({
  setBasePath: vi.fn(),
  registeredQueueNames: [] as string[],
  adapterOptions: [] as Array<{ queueName: string; options: any }>,
  boardRegistrations: [] as any[],
  metricRecorders: [] as any[],
  historyProviders: [] as any[],
}));

vi.mock('../lib/queue.js', () => ({ getRedisConnection: vi.fn(async () => ({})) }));
vi.mock('bullmq', () => ({ Queue: class Queue { constructor(public name: string) {} } }));
vi.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: class BullMQAdapter {
    constructor(queue: { name: string }, options: any) {
      registeredQueueNames.push(queue.name);
      adapterOptions.push({ queueName: queue.name, options });
    }
  },
}));
vi.mock('@bull-board/api', () => ({ createBullBoard: vi.fn((config: any) => boardRegistrations.push(config)) }));
vi.mock('@bull-board/metrics', () => ({
  MetricsRecorder: class MetricsRecorder {
    options: any;
    started = false;
    constructor(options: any) {
      this.options = options;
      metricRecorders.push(this);
    }
    start() { this.started = true; }
    stop() { this.started = false; }
  },
  RedisMetricsHistoryProvider: class RedisMetricsHistoryProvider {
    options: any;
    disconnected = false;
    constructor(options: any) {
      this.options = options;
      historyProviders.push(this);
    }
    disconnect() { this.disconnected = true; }
  },
}));
vi.mock('@bull-board/express', async () => {
  const express = await import('express');
  return {
    ExpressAdapter: class ExpressAdapter {
      router = express.Router();
      setBasePath = setBasePath;
      getRouter() {
        this.router.get('/', (_req, res) => res.type('html').send('<html>Bull Board</html>'));
        this.router.get('/static/*', (_req, res) => res.type('js').send('window.bullBoard = true'));
        return this.router;
      }
    },
  };
});

import bullBoardRoutes from '../routes/bull-board.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

function buildApp() {
  const app = express();
  app.use('/api/admin/queues', bullBoardRoutes);
  app.use(errorHandler);
  return app;
}

function authToken(role: string) {
  return jwt.sign({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@example.com', role }, process.env.JWT_SECRET!);
}

describe('Bull Board routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPERADMIN_EMAIL = 'board-admin@example.test';
    process.env.SUPERADMIN_PASSWORD = 'board-test-password';
    registeredQueueNames.splice(0);
    adapterOptions.splice(0);
    boardRegistrations.splice(0);
    metricRecorders.splice(0);
    historyProviders.splice(0);
  });

  it('requires superadmin authentication', async () => {
    const anonymous = await request(buildApp()).get('/api/admin/queues');
    expect(anonymous.status).toBe(401);

    const regularUser = await request(buildApp())
      .get('/api/admin/queues')
      .set('Authorization', `Bearer ${authToken('owner')}`);
    expect(regularUser.status).toBe(403);

    const wrongBasicCredentials = await request(buildApp())
      .get('/api/admin/queues')
      .auth('board-admin@example.test', 'incorrect-password');
    expect(wrongBasicCredentials.status).toBe(401);
  });

  it('serves the panel and assets to the superadmin browser login at the API mount path', async () => {
    const app = buildApp();

    const panel = await request(app).get('/api/admin/queues').auth('board-admin@example.test', 'board-test-password');
    const asset = await request(app).get('/api/admin/queues/static/main.js').auth('board-admin@example.test', 'board-test-password');

    expect(panel.status).toBe(200);
    expect(panel.text).toContain('Bull Board');
    expect(asset.status).toBe(200);
    expect(asset.text).toContain('bullBoard');
    expect(setBasePath).toHaveBeenCalledWith('/api/admin/queues');
    expect(registeredQueueNames.sort()).toEqual([
      'billing-renewal',
      'budget-optimize',
      'fury-engine',
      'google-sync',
      'lead-status',
      'meta-initial-sync',
      'meta-sync',
      'planner-generate',
      'publish-due',
      'rule-engine',
      'studio-compliance-check',
      'studio-compliance-sweeper',
      'studio-generate-image',
      'studio-video',
    ]);
    expect(adapterOptions).toHaveLength(14);
    expect(adapterOptions.every(({ options }) => options?.delimiter === '.')).toBe(true);
    expect(adapterOptions.every(({ options }) => options?.displayName && options?.description)).toBe(true);
    expect(new Set(adapterOptions.map(({ options }) => options.displayName)).size).toBe(14);
    expect(boardRegistrations.at(-1)?.options?.uiConfig?.overview?.groupByDelimiter).toBe(true);
    expect(boardRegistrations.at(-1)?.options?.uiConfig?.showMetrics).toBe(true);
    expect(boardRegistrations.at(-1)?.options?.historyProvider).toBe(historyProviders.at(-1));
    expect(metricRecorders.at(-1)?.started).toBe(true);
    expect(metricRecorders.at(-1)?.options).toMatchObject({
      prefix: 'fury-app:bull-board:metrics',
      retentionDays: 90,
      snapshotIntervalMs: 60_000,
    });
    expect(metricRecorders.at(-1)?.options.queues).toHaveLength(14);
    expect(adapterOptions.find(({ queueName }) => queueName === 'meta-sync')?.options).toEqual({
      prefix: 'meta.',
      delimiter: '.',
      displayName: 'Dados da conta Meta',
      description: 'Sincroniza dados das contas de anúncios Meta, incluindo campanhas e métricas.',
      allowRetries: true,
      allowCompletedRetries: true,
    });
    const expectedGroups: Record<string, string> = {
      'billing-renewal': 'ady.',
      'budget-optimize': 'ady.',
      'fury-engine': 'ady.',
      'rule-engine': 'ady.',
      'meta-sync': 'meta.',
      'meta-initial-sync': 'meta.',
      'lead-status': 'meta.',
      'publish-due': 'meta.',
      'google-sync': 'google.',
      'planner-generate': 'planner.',
      'studio-compliance-sweeper': 'studio.',
      'studio-compliance-check': 'studio.',
      'studio-generate-image': 'studio.',
      'studio-video': 'studio.',
    };
    for (const [queueName, prefix] of Object.entries(expectedGroups)) {
      expect(adapterOptions.find((adapter) => adapter.queueName === queueName)?.options.prefix).toBe(prefix);
    }
    expect(adapterOptions.every(({ options }) => options.allowRetries === true)).toBe(true);
    expect(adapterOptions.every(({ options }) => options.allowCompletedRetries === true)).toBe(true);
  });

  it('continues to allow authenticated superadmin bearer tokens', async () => {
    const response = await request(buildApp())
      .get('/api/admin/queues')
      .set('Authorization', `Bearer ${authToken('superadmin')}`);
    expect(response.status).toBe(200);
  });
});
