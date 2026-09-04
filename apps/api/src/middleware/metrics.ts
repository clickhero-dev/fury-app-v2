import { type Request, type Response, type NextFunction } from 'express';
import { metrics } from '@opentelemetry/api';

/**
 * Métricas HTTP (RED) da API: counter por rota/status + histograma de duração.
 * Alimenta o dashboard fury-api-red no Prometheus.
 *
 * Camada de infra (adapter de borda, noop quando OTel desligado).
 */
const meter = metrics.getMeter('fury.http');
const requestsCounter = meter.createCounter('fury.http.requests', {
  description: 'Requisições HTTP por método/rota/status',
});
const durationHistogram = meter.createHistogram('fury.http.duration', {
  description: 'Duração da resposta HTTP (ms)',
  unit: 'ms',
});

function routeOf(req: Request): string {
  // Express popula req.route no dispatch: pattern com :params (evita cardinalidade alta)
  const pattern = (req as Request & { route?: { path?: string } }).route?.path;
  return pattern ?? req.path;
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const route = routeOf(req);
    const labels = { method: req.method, route };
    requestsCounter.add(1, { ...labels, status: String(res.statusCode) });
    durationHistogram.record(Date.now() - start, labels);
  });

  next();
}