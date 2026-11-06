/** BullMQ stores worker metric samples by minute; ONE_WEEK is 10,080 minutes. */
const ONE_WEEK_IN_MINUTES = 7 * 24 * 60;

/** Name workers for Bull Board's worker panel and retain enough native metrics to backfill history. */
export function getWorkerMetricsOptions(name: string) {
  return {
    name,
    metrics: { maxDataPoints: ONE_WEEK_IN_MINUTES },
  } as const;
}
