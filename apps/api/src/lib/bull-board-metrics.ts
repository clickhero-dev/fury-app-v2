import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import { MetricsRecorder, RedisMetricsHistoryProvider } from '@bull-board/metrics';
import type IORedis from 'ioredis';

const METRICS_PREFIX = 'fury-app:bull-board:metrics';
const RETENTION_DAYS = 90;
const SNAPSHOT_INTERVAL_MS = 60_000;

let recorder: MetricsRecorder | null = null;
let historyProvider: RedisMetricsHistoryProvider | null = null;

export function startBullBoardMetrics(queues: BaseAdapter[], connection: IORedis): RedisMetricsHistoryProvider {
  if (recorder && historyProvider) return historyProvider;

  historyProvider = new RedisMetricsHistoryProvider({
    connection,
    prefix: METRICS_PREFIX,
    retentionDays: RETENTION_DAYS,
  });
  recorder = new MetricsRecorder({
    queues,
    connection,
    prefix: METRICS_PREFIX,
    retentionDays: RETENTION_DAYS,
    snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
    onSnapshotError: (error, queueName) => {
      console.error('[bull-board] Falha ao registrar métricas da fila', { queueName, error });
    },
    onLatencyError: (error, queueName) => {
      console.error('[bull-board] Falha ao coletar latência da fila', { queueName, error });
    },
  });
  recorder.start();
  return historyProvider;
}

export function stopBullBoardMetrics(): void {
  recorder?.stop();
  recorder = null;
  historyProvider?.disconnect();
  historyProvider = null;
}
