import { pino } from 'pino';

/**
 * Logger estruturado (pino). Os registros viram LogRecords OTel automaticamente
 * via @opentelemetry/instrumentation-pino (incluído no auto-instrumentations-node),
 * chegando ao Loki com trace_id/span_id correlacionados aos spans do Tempo.
 *
 * Uso: substitui console.log/error nos módulos da API (infra). Sem acesso a
 * repositórios — camada de observabilidade.
 */
export const logger = pino({
  name: 'fury-api',
  level: process.env.OTEL_LOG_LEVEL || 'info',
  base: { service: process.env.OTEL_SERVICE_NAME || 'fury-api' },
  redact: {
    // Nunca logar credenciais/tokens (headers de request, body de auth)
    paths: [
      'authorization',
      'req.headers.authorization',
      'headers.authorization',
      'password',
      'token',
      'refreshToken',
      'accessToken',
    ],
    censor: '[REDACTED]',
  },
});