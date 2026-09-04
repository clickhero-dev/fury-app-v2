import { type IncomingMessage } from 'node:http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { HostMetrics } from '@opentelemetry/host-metrics';

/**
 * Bootstrap OpenTelemetry (camada de infra/adaptador — sem acesso a repositórios).
 *
 * Só inicializa quando OTEL_ENABLED=true E OTEL_EXPORTER_OTLP_ENDPOINT está
 * definido (ex.: EasyPanel). O collector LGTM (docker-otel-lgtm) recebe
 * OTLP/HTTP em :4318 e roteia: traces→Tempo, métricas→Prometheus, logs→Loki.
 *
 * Endpoints dos exporters vêm do env padrão do SDK:
 * - OTEL_EXPORTER_OTLP_ENDPOINT (base, ex. http://host:4318)
 * - OTEL_SERVICE_NAME (default fury-api)
 * - OTEL_EXPORTER_OTLP_TIMEOUT etc. (opcional)
 */
let sdk: NodeSDK | null = null;

function shouldIgnoreIncoming(req: IncomingMessage): boolean {
  const url = req.url ?? '';
  return (
    url.startsWith('/health') ||
    url.startsWith('/docs') ||
    url.startsWith('/swagger.json') ||
    url.startsWith('/studio-assets')
  );
}

export function initOtel(): { enabled: boolean } {
  const enabled =
    process.env.OTEL_ENABLED === 'true' &&
    !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!enabled) {
    return { enabled: false };
  }

  const resource = resourceFromAttributes({
    'service.name': process.env.OTEL_SERVICE_NAME || 'fury-api',
    'deployment.environment': process.env.NODE_ENV || 'development',
  });

  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 30_000,
    }),
    logRecordProcessor: new BatchLogRecordProcessor({
      exporter: new OTLPLogExporter(),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Não instrumentar rotas de health/docs/estáticos (sem valor de RED)
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: shouldIgnoreIncoming,
        },
      }),
    ],
  });

  sdk.start();

  // hostMetrics NÃO é uma Instrumentation: precisa do MeterProvider global que
  // o NodeSDK registra no start() — instanciar/startar depois do SDK.
  const metrics = new HostMetrics({ name: 'fury.runtime' });
  metrics.start();

  return { enabled: true };
}

export async function shutdownOtel(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}