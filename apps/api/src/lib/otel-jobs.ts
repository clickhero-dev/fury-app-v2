import { trace, metrics, SpanStatusCode, type Span } from '@opentelemetry/api';

/**
 * Span manual por job BullMQ (não existe auto-instrumentação publicada para
 * BullMQ). Camada de infra/observabilidade — sem acesso a repositórios.
 *
 * Gera span `queue.<queue> process` (Tempo) + métricas Prometheus:
 * - fury.jobs.completed / fury.jobs.failed (counter por queue)
 * - fury.jobs.duration (histogram, ms)
 *
 * Em dev/test (sem OTel init) o global provider é Noop → no-op seguro.
 */

export interface JobSpanAttributes {
  queue: string;
  jobId?: string;
  tenantId?: string;
  attempt?: number;
}

const meter = metrics.getMeter('fury.jobs');
const completedCounter = meter.createCounter('fury.jobs.completed', {
  description: 'Jobs BullMQ concluídos com sucesso',
});
const failedCounter = meter.createCounter('fury.jobs.failed', {
  description: 'Jobs BullMQ que falharam',
});
const durationHistogram = meter.createHistogram('fury.jobs.duration', {
  description: 'Duração do processamento do job (ms)',
  unit: 'ms',
});

export async function withJobSpan<T>(
  attrs: JobSpanAttributes,
  name: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const tracer = trace.getTracer('fury-jobs');
  const start = Date.now();

  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('messaging.system', 'redis');
    span.setAttribute('messaging.destination', attrs.queue);
    if (attrs.jobId) span.setAttribute('job.id', attrs.jobId);
    if (attrs.tenantId) span.setAttribute('tenant.id', attrs.tenantId);
    if (attrs.attempt != null) span.setAttribute('job.attempt', attrs.attempt);

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      completedCounter.add(1, { queue: attrs.queue });
      durationHistogram.record(Date.now() - start, { queue: attrs.queue });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (err as Error).message,
      });
      failedCounter.add(1, { queue: attrs.queue });
      durationHistogram.record(Date.now() - start, { queue: attrs.queue });
      throw err;
    } finally {
      span.end();
    }
  });
}