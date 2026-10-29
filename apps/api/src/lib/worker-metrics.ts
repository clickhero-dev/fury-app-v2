import { MetricsTime } from 'bullmq';

/** Name workers for Bull Board's worker panel and retain enough native metrics to backfill history. */
export function getWorkerMetricsOptions(name: string) {
  return {
    name,
    metrics: { maxDataPoints: MetricsTime.ONE_WEEK },
  } as const;
}
