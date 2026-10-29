import { describe, expect, it } from 'vitest';

/*
  Funcionalidade: habilitar métricas nativas de throughput em workers BullMQ

  Cenário: manter janela suficiente para o recorder histórico e identificar o worker no painel
    Dado um worker registrado no board
    Quando ele é criado com as opções compartilhadas
    Então anuncia seu nome no Bull Board e mantém uma semana de métricas nativas
*/

import { getWorkerMetricsOptions } from '../lib/worker-metrics.js';

describe('BullMQ worker metrics options', () => {
  it('retains one week of native completed and failed metrics', () => {
    expect(getWorkerMetricsOptions('meta-sync-worker')).toEqual({
      name: 'meta-sync-worker',
      metrics: { maxDataPoints: 10_080 },
    });
  });
});
