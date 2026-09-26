// =============================================================================
// Guard — ADR-0003: meta-async-sync-v2.md (decisões obrigatórias documentadas)
//
// Espelha o padrão de policy-reorder.test.ts: guard de regressão sobre docs.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const ADR_PATH = resolve(REPO_ROOT, 'docs/adr/0003-meta-async-sync-v2.md');

describe('ADR-0003 — meta async sync v2', () => {
  it('documenta cron 15min, stale 15min, endpoints v2 e política de email', () => {
    const text = readFileSync(ADR_PATH, 'utf8');
    expect(text).toContain('*/15 * * * *');
    expect(text).toContain('>15min');
    expect(text).toContain('/api/v2/campaigns');
    expect(text).toContain('/api/v2/leads');
    expect(text).toContain('/api/v2/lead-campaigns');
    expect(text).toContain('/api/v2/metrics/summary');
    expect(text).toContain('/api/v2/dashboard/instagram-insights');
    expect(text).toContain('SYNC_ALERT_EMAILS');
    expect(text).toContain('diogommtdes@gmail.com;diogo.souza@clickhero.com.br');
    expect(text).toContain('dedupe');
  });

  it('segue o template ADR (Contexto / Decisão / Alternativas / Consequências)', () => {
    const text = readFileSync(ADR_PATH, 'utf8');
    expect(text).toContain('## Context');
    expect(text).toContain('## Decision');
    expect(text).toContain('## Alternatives Considered');
    expect(text).toContain('## Consequences');
  });
});