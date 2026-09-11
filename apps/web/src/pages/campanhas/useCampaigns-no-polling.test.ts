import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * T8 — Frontend: polling de 30s removido do useCampaigns (feature 014).
 * Com métricas pré-processadas (metrics_daily, sync 1h), o refetchInterval
 * de 30s perde a razão de existir e só gastaria quota/round-trips.
 * Guard de regressão: o hook não pode ter refetchInterval.
 */
const here = dirname(fileURLToPath(import.meta.url));
const hookSource = readFileSync(resolve(here, '../../hooks/useCampaigns.ts'), 'utf-8');

describe('useCampaigns sem polling', () => {
  it('não define refetchInterval (polling 30s removido)', () => {
    expect(hookSource).not.toMatch(/refetchInterval/);
  });

  it('mantém keepPreviousData (UX de transição de filtro preservada)', () => {
    expect(hookSource).toMatch(/keepPreviousData/);
  });

  it('mantém staleTime (cache client-side coerente com dado de ~1h)', () => {
    expect(hookSource).toMatch(/staleTime/);
  });
});
