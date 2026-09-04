import { describe, it, expect, vi, beforeEach } from 'vitest';

const span = {
  setAttribute: vi.fn(),
  setStatus: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
};

const counterAdd = vi.fn();
const histogramRecord = vi.fn();

const tracerMock = vi.hoisted(() => ({
  startActiveSpan: vi.fn((_name: string, fn: (s: typeof span) => Promise<unknown>) => fn(span)),
}));

const meterMock = vi.hoisted(() => ({
  createCounter: vi.fn(() => ({ add: counterAdd })),
  createHistogram: vi.fn(() => ({ record: histogramRecord })),
}));

vi.mock('@opentelemetry/api', () => ({
  trace: { getTracer: () => tracerMock },
  metrics: { getMeter: () => meterMock },
  SpanStatusCode: { OK: 1, ERROR: 2, UNSET: 0 },
}));

const { withJobSpan } = await import('../lib/otel-jobs.js');

beforeEach(() => {
  vi.clearAllMocks();
});

const ATTRS = { queue: 'planner-generate', jobId: 'job-1', tenantId: 'tenant-9', attempt: 2 };

describe('withJobSpan (sucesso)', () => {
  it('cria span com atributos do job e status OK', async () => {
    const result = await withJobSpan(ATTRS, 'planner-generate process', async (s) => {
      s.setAttribute('extra', 1);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(tracerMock.startActiveSpan).toHaveBeenCalledWith('planner-generate process', expect.any(Function));

    const attributeCalls = span.setAttribute.mock.calls.map((c: unknown[]) => c.slice(0, 2));
    expect(attributeCalls).toEqual(
      expect.arrayContaining([
        ['messaging.system', 'redis'],
        ['messaging.destination', 'planner-generate'],
        ['job.id', 'job-1'],
        ['tenant.id', 'tenant-9'],
        ['job.attempt', 2],
      ])
    );

    expect(span.setStatus).toHaveBeenCalledWith({ code: 1 });
    expect(span.end).toHaveBeenCalled();
    expect(span.recordException).not.toHaveBeenCalled();
  });

  it('registra métrica de sucesso e duração com atributo queue', async () => {
    await withJobSpan(ATTRS, 'x process', async () => 'ok');
    expect(counterAdd).toHaveBeenCalledWith(1, { queue: 'planner-generate' });
    expect(histogramRecord).toHaveBeenCalledWith(expect.any(Number), { queue: 'planner-generate' });
  });
});

describe('withJobSpan (erro)', () => {
  it('marca erro, grava exception, conta falha e relança', async () => {
    const boom = new Error('job explodiu');
    await expect(
      withJobSpan(ATTRS, 'x process', async () => {
        throw boom;
      })
    ).rejects.toThrow('job explodiu');

    expect(span.recordException).toHaveBeenCalledWith(boom);
    expect(span.setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: 2 }));
    expect(span.end).toHaveBeenCalled();
    expect(counterAdd).toHaveBeenCalledWith(1, { queue: 'planner-generate' });
  });

  it('sem atributos opcionais funciona (só queue)', async () => {
    await withJobSpan({ queue: 'basic' }, 'basic process', async () => 'x');
    const attributeCalls = span.setAttribute.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(attributeCalls).toContain('messaging.destination');
    expect(attributeCalls).not.toContain('job.id');
  });
});