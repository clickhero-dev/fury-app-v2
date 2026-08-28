import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useGoogleProfileQuality } from './useGoogleMeuNegocio';
import type { GoogleQualityReport } from '@/types/google';

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: {
    get: mockApiGet,
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const REPORT: GoogleQualityReport = {
  score: 92,
  grade: 'EXCELLENT',
  complete: true,
  verified: true,
  outdated: false,
  lastUpdated: '2026-07-01T12:00:00Z',
  missingFields: [],
  recommendations: ['website'],
  warnings: [],
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useGoogleProfileQuality', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('busca o relatório de qualidade do perfil pelo id', async () => {
    mockApiGet.mockResolvedValue({ data: { success: true, data: REPORT } });
    const { result } = renderHook(() => useGoogleProfileQuality('p-1', true), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(mockApiGet).toHaveBeenCalledWith('/google/profiles/p-1/quality');
    expect(result.current.data).toEqual(REPORT);
  });

  it('não dispara requisição quando desabilitado', async () => {
    const { result } = renderHook(() => useGoogleProfileQuality('p-1', false), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});