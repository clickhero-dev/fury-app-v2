import { describe, it, expect, vi, afterEach } from 'vitest';

// vi.hoisted: variável acessível dentro da factory do vi.mock (hoisting)
const pinoMock = vi.hoisted(() =>
  vi.fn((_opts: unknown) => ({ level: 'info', info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))
);

vi.mock('pino', () => ({
  default: pinoMock,
  pino: pinoMock,
}));

// Importa o logger depois do mock (hoisted)
const { logger } = await import('../lib/logger.js');

// Captura a config da ÚNICA chamada (clearAllMocks abaixo apagaria depois)
const firstCall: unknown[] | undefined = pinoMock.mock.calls[0];
const pinoConfig: Record<string, unknown> = (firstCall?.[0] as Record<string, unknown> | undefined) ?? {};

afterEach(() => {
  vi.clearAllMocks();
});

describe('logger', () => {
  it('cria um pino com name fury-api', () => {
    expect(pinoMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'fury-api' }));
  });

  it('configura redact para não vazar credenciais', () => {
    expect(pinoConfig.redact).toBeDefined();
    const redact = pinoConfig.redact as { paths?: string[] };
    expect(redact.paths).toContain('authorization');
  });

  it('usa nível info por padrão', () => {
    expect(logger.level).toBe('info');
  });

  it('expõe os métodos de log esperados', () => {
    for (const m of ['info', 'warn', 'error', 'debug']) {
      expect(typeof (logger as Record<string, unknown>)[m]).toBe('function');
    }
  });
});