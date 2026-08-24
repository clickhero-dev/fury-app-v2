/**
 * Logger estruturado para o pipeline do Planejador IA.
 *
 * Adiciona tenantId, jobId e timestamp a cada log, facilitando
 * debug e correlação de eventos no pipeline.
 */

type LogLevel = 'info' | 'warn' | 'error';

interface LogContext {
  tenantId?: string;
  jobId?: string;
  agent?: string;
}

function format(level: LogLevel, message: string, ctx: LogContext, data?: unknown): string {
  const parts: string[] = [];
  if (ctx.tenantId) parts.push(`tenant:${ctx.tenantId.slice(0, 8)}`);
  if (ctx.jobId) parts.push(`job:${ctx.jobId.slice(0, 8)}`);
  if (ctx.agent) parts.push(`agent:${ctx.agent}`);

  const prefix = parts.length > 0 ? `[${parts.join(' | ')}]` : '';
  const ts = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `${ts} [${level.toUpperCase()}]${prefix} ${message}${dataStr}`;
}

export const plannerLogger = {
  info(message: string, ctx: LogContext = {}, data?: unknown) {
    console.log(format('info', message, ctx, data));
  },

  warn(message: string, ctx: LogContext = {}, data?: unknown) {
    console.warn(format('warn', message, ctx, data));
  },

  error(message: string, ctx: LogContext = {}, data?: unknown) {
    console.error(format('error', message, ctx, data));
  },

  /**
   * Wrapper que loga início e fim de uma operação com duração.
   */
  async timed<T>(
    operation: string,
    fn: () => Promise<T>,
    ctx: LogContext,
  ): Promise<T> {
    const start = Date.now();
    this.info(`${operation} — iniciado`, ctx);
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.info(`${operation} — concluído em ${duration}ms`, ctx, { duration });
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      this.error(`${operation} — falhou após ${duration}ms: ${msg}`, ctx);
      throw err;
    }
  },
};
