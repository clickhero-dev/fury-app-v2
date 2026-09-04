import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sweepOrphanComplianceAnalysis, ORPHAN_AFTER_MS } from '../services/studio/compliance-sweeper.js';

const OLD = new Date(Date.now() - 45 * 60 * 1000); // criado há 45min → órfão
const RECENT = new Date(Date.now() - 2 * 60 * 1000); // há 2min → ainda pode ter job ativo

const ORPHAN_MS = 30 * 60 * 1000; // regra: órfã apenas se criada há MAIS de 30min
const isOrphanByAge = (createdAt: Date) => Date.now() - createdAt.getTime() > ORPHAN_MS;

function makeDeps({
  candidates = [],
  inFlight = new Set<string>(),
  add = vi.fn(async () => ({ id: 'job-1' }) as any),
}: {
  candidates?: Array<{ id: string; tenantId: string; createdAt: Date }>;
  inFlight?: Set<string>;
  add?: any;
} = {}) {
  return {
    db: { select: (...args: any[]) => ({ from: () => ({ where: (...a: any[]) => ({ limit: async () => candidates }) }) }) },
    inFlight,
    queue: { add },
  } as any;
}

describe('sweepOrphanComplianceAnalysis — análise órfã é re-enfileirada (nunca fica "analisando" para sempre)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('re-enfileira asset pendente criado há mais de 10min e sem job em fila', async () => {
    const add = vi.fn(async () => ({ id: 'job-1' }));
    const deps = makeDeps({
      candidates: [{ id: 'asset-1', tenantId: 't-1', createdAt: OLD }],
      add,
    });
    const n = await sweepOrphanComplianceAnalysis(deps);

    expect(n).toBe(1);
    expect(add).toHaveBeenCalledWith(
      'compliance-check',
      { creativeAssetId: 'asset-1', tenantId: 't-1' },
      expect.objectContaining({ attempts: 4, backoff: { type: 'exponential', delay: 10_000 } })
    );
  });

  it('NÃO re-enfileira asset que já tem job em fila (wait/active/delayed)', async () => {
    const add = vi.fn(async () => ({ id: 'job-1' }));
    const deps = makeDeps({
      candidates: [{ id: 'asset-1', tenantId: 't-1', createdAt: OLD }],
      inFlight: new Set(['asset-1']),
      add,
    });
    const n = await sweepOrphanComplianceAnalysis(deps);

    expect(n).toBe(0);
    expect(add).not.toHaveBeenCalled();
  });

  it('fronteira da órfã: 29min NÃO é órfã; 31min é órfã (evita falsos órfãos)', () => {
    expect(isOrphanByAge(new Date(Date.now() - 29 * 60 * 1000))).toBe(false);
    expect(isOrphanByAge(new Date(Date.now() - 31 * 60 * 1000))).toBe(true);
  });

  it('constante do módulo exige MAIS de 30 minutos desde a criação (sem falsos órfãos)', () => {
    expect(ORPHAN_AFTER_MS).toBeGreaterThanOrEqual(30 * 60 * 1000);
  });

  it('asset recente (2min) não é considerado órfão', () => {
    expect(isOrphanByAge(RECENT)).toBe(false);
  });

  it('sem candidatos → nada a fazer', async () => {
    const add = vi.fn();
    const deps = makeDeps({ candidates: [], add });
    expect(await sweepOrphanComplianceAnalysis(deps)).toBe(0);
    expect(add).not.toHaveBeenCalled();
  });
});