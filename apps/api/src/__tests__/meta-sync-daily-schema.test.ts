// # Language: pt-BR
// Funcionalidade: persistir métricas diárias por campanha com isolamento de tenant.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { metaCampaignDailyInsights } from '@fury/db';

const migration = readFileSync(resolve(process.cwd(), 'packages/db/migrations/0045_meta_campaign_daily_insights.sql'), 'utf8');

describe('meta_campaign_daily_insights', () => {
  it('define chave única para upsert idempotente por tenant/campanha/dia', () => {
    expect(metaCampaignDailyInsights.date.name).toBe('date');
    expect(metaCampaignDailyInsights.metrics.name).toBe('metrics');
    expect(migration).toContain('UNIQUE (tenant_id, meta_campaign_id, date)');
  });

  it('aplica RLS por tenant na migration', () => {
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("current_setting('app.current_tenant_id')::uuid");
  });
});
