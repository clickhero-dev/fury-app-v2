import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import { InsightsCampanha } from './InsightsCampanha';

// recharts: renderização trivial no jsdom (ResponsiveContainer mede 0).
vi.mock('recharts', async () => {
  const ReactLib = await import('react');
  const PassThrough = ({ children }: { children?: ReactNode }) =>
    ReactLib.createElement('div', null, children);
  return {
    AreaChart: PassThrough,
    Area: PassThrough,
    XAxis: PassThrough,
    YAxis: PassThrough,
    CartesianGrid: PassThrough,
    Tooltip: PassThrough,
    Legend: PassThrough,
    ResponsiveContainer: PassThrough,
  };
});

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet },
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/campanhas/mc1']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/campanhas/:id" element={children as React.ReactElement} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function mockInsights(data: unknown) {
  mockApiGet.mockResolvedValue({ data: { success: true, data } });
}

describe('InsightsCampanha — card Pessoas', () => {
  beforeEach(() => mockApiGet.mockReset());

  it('usa totals.conversions do backend (fills do form) como Pessoas, não a soma diária', async () => {
    mockInsights({
      campaign: { id: 'mc1', name: 'Vagas Executivo Comercial', status: 'PAUSED' },
      // soma diária dos insights = 6, mas o form tem 4 preenchimentos
      timeseries: [
        { date: '2026-09-23', spend: 8.66, impressions: 1200, clicks: 25, ctr: 2.08, cpc: 0.35, cpm: 7.2, roas: null, cpa: null, conversions: 6 },
        { date: '2026-09-24', spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, roas: null, cpa: null, conversions: 0 },
      ],
      totals: { conversions: 4 },
      creatives: [],
    });

    render(<InsightsCampanha />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Pessoas')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.queryByText('6')).toBeNull();
  });

  it('sem totals do backend cai na soma diária (fallback legado)', async () => {
    mockInsights({
      campaign: { id: 'mc1', name: 'Camp Tráfego', status: 'ACTIVE' },
      timeseries: [
        { date: '2026-09-23', spend: 8, impressions: 1000, clicks: 25, ctr: 2.5, cpc: 0.32, cpm: 8, roas: null, cpa: null, conversions: 6 },
      ],
      totals: undefined,
      creatives: [],
    });

    render(<InsightsCampanha />, { wrapper: makeWrapper() });

    expect(await screen.findByText('6')).toBeTruthy();
  });
});
