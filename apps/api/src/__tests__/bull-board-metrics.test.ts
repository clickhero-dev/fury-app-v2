import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
  Funcionalidade: coletar histórico durável de throughput do Bull Board no Redis

  Cenário: iniciar a coleta usando as filas reais do painel
    Dado um conjunto de adapters BullMQ e a conexão Redis compartilhada
    Quando o coletor é inicializado
    Então inicia o recorder com namespace e retenção definidos e retorna o provider

  Cenário: iniciar a coleta mais de uma vez
    Dado que o recorder já está rodando
    Quando a inicialização é chamada novamente
    Então reutiliza o recorder e o provider existentes

  Cenário: desligar o painel
    Dado um recorder e um provider ativos
    Quando o shutdown é executado
    Então interrompe a coleta e desconecta o provider
*/

const { recorders, providers } = vi.hoisted(() => ({
  recorders: [] as any[],
  providers: [] as any[],
}));

vi.mock('@bull-board/metrics', () => ({
  MetricsRecorder: class MetricsRecorder {
    options: any;
    isRunning = false;
    constructor(options: any) {
      this.options = options;
      recorders.push(this);
    }
    start() { this.isRunning = true; }
    stop() { this.isRunning = false; }
  },
  RedisMetricsHistoryProvider: class RedisMetricsHistoryProvider {
    options: any;
    disconnected = false;
    constructor(options: any) {
      this.options = options;
      providers.push(this);
    }
    disconnect() { this.disconnected = true; }
  },
}));

import { startBullBoardMetrics, stopBullBoardMetrics } from '../lib/bull-board-metrics.js';

describe('Bull Board metrics lifecycle', () => {
  beforeEach(() => {
    recorders.splice(0);
    providers.splice(0);
    stopBullBoardMetrics();
  });

  it('records historical metrics for the board queues in Redis', () => {
    const queues = [{ getName: () => 'meta.meta-sync' }, { getName: () => 'ady.billing-renewal' }] as any;
    const connection = {} as any;

    const provider = startBullBoardMetrics(queues, connection);

    expect(recorders).toHaveLength(1);
    expect(recorders[0].isRunning).toBe(true);
    expect(recorders[0].options).toMatchObject({
      queues,
      connection,
      prefix: 'fury-app:bull-board:metrics',
      retentionDays: 90,
      snapshotIntervalMs: 60_000,
    });
    expect(providers).toHaveLength(1);
    expect(providers[0].options).toMatchObject({
      connection,
      prefix: 'fury-app:bull-board:metrics',
      retentionDays: 90,
    });
    expect(provider).toBe(providers[0]);
  });

  it('reuses the current recorder and provider when initialized repeatedly', () => {
    const queues = [] as any[];
    const connection = {} as any;

    const first = startBullBoardMetrics(queues, connection);
    const second = startBullBoardMetrics(queues, connection);

    expect(second).toBe(first);
    expect(recorders).toHaveLength(1);
    expect(providers).toHaveLength(1);
  });

  it('stops the recorder and disconnects its provider on shutdown', () => {
    startBullBoardMetrics([] as any[], {} as any);

    stopBullBoardMetrics();

    expect(recorders[0].isRunning).toBe(false);
    expect(providers[0].disconnected).toBe(true);
  });
});
