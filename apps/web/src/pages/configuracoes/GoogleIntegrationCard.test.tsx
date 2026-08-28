import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { GoogleIntegrationCard } from './GoogleIntegrationCard';
import type { GoogleConnection, GoogleLookupResult } from '@/types/google';

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe">{location.pathname}</span>;
}

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

const CONNECTION: GoogleConnection = {
  id: 'conn-1',
  googleUserId: 'g-user-1',
  accountId: 'accounts/111',
  accountName: 'Minha Empresa',
  tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
  connected: true,
};

const LOOKUP_FOUND: GoogleLookupResult = {
  found: true,
  duplicateAlert: false,
  matches: [
    {
      gbpLocationId: 'accounts/111/locations/abc',
      name: 'Minha Empresa',
      address: { street: 'Av. Paulista, 1000', city: 'São Paulo', state: 'SP', postalCode: '01310-100', country: 'BR' },
      phone: '+55 11 99999-9999',
      verificationState: 'VERIFIED',
      claimed: true,
      confidence: 'HIGH',
    },
  ],
};

const LOOKUP_NOT_FOUND: GoogleLookupResult = { found: false, duplicateAlert: false, matches: [] };

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/configuracoes']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('GoogleIntegrationCard — ação contextual do Google Meu Negócio', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('exibe "Ver como está meu Google Meu Negócio" quando há conexão e perfil encontrado', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: { success: true, data: CONNECTION } }) // /google/connections
      .mockResolvedValueOnce({ data: { success: true, data: LOOKUP_FOUND } }); // /google/lookup

    render(<GoogleIntegrationCard />, { wrapper: makeWrapper() });

    const link = await screen.findByRole('link', { name: /Ver como está meu Google Meu Negócio/i });
    expect(link).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Configurar agora/i })).not.toBeInTheDocument();
  });

  it('exibe "Configurar agora" quando há conexão mas não há perfil', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: { success: true, data: CONNECTION } })
      .mockResolvedValueOnce({ data: { success: true, data: LOOKUP_NOT_FOUND } });

    render(<GoogleIntegrationCard />, { wrapper: makeWrapper() });

    const button = await screen.findByRole('button', { name: /Configurar agora/i });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ver como está meu Google Meu Negócio/i })).not.toBeInTheDocument();
  });

  it('navega para a página do Google Meu Negócio ao clicar em "Ver como está"', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: { success: true, data: CONNECTION } })
      .mockResolvedValueOnce({ data: { success: true, data: LOOKUP_FOUND } });

    render(
      <>
        <GoogleIntegrationCard />
        <LocationProbe />
      </>,
      { wrapper: makeWrapper() }
    );

    const link = await screen.findByRole('link', { name: /Ver como está meu Google Meu Negócio/i });
    await userEvent.click(link);
    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/configuracoes/google-meu-negocio')
    );
  });

  it('exibe "Conectar Google" quando não há conexão', async () => {
    mockApiGet.mockResolvedValueOnce({ data: { success: true, data: null } });

    render(<GoogleIntegrationCard />, { wrapper: makeWrapper() });

    expect(await screen.findByRole('button', { name: /Conectar Google/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ver como está meu Google Meu Negócio/i })).not.toBeInTheDocument();
  });
});