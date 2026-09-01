import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { IntegracoesContent } from './IntegracoesContent';
import type { MetaConnection } from '@/types/meta';

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

const FUTURE = new Date(Date.now() + 3600_000).toISOString();
const PAST = new Date(Date.now() - 3600_000).toISOString();

function connection(overrides: Partial<MetaConnection>): MetaConnection {
  return {
    id: 'conn-1',
    tenantId: 'tenant-1',
    metaUserId: 'meta-user-1',
    accessToken: 'tok',
    tokenExpiresAt: FUTURE,
    adAccounts: [],
    selectedAdAccountId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/configuracoes/integracoes']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('IntegracoesContent — status de conexão da conta Meta', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  function mockApi(connections: MetaConnection[]) {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/meta/connections') {
        return Promise.resolve({ data: { success: true, data: connections } });
      }
      if (url === '/meta/scopes') {
        return Promise.resolve({ data: { success: true, data: { scopes: [] } } });
      }
      // /google/connections (GoogleIntegrationCard) — sem conexão Google
      return Promise.resolve({ data: { success: true, data: null } });
    });
  }

  it('exibe o badge "Ativa" quando o token da conexão Meta é válido', async () => {
    mockApi([connection({})]);

    render(<IntegracoesContent />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Ativa')).toBeInTheDocument();
    expect(screen.queryByText('Pausada')).not.toBeInTheDocument();
  });

  it('exibe o badge "Pausada" quando o token da conexão Meta expirou', async () => {
    mockApi([connection({ tokenExpiresAt: PAST })]);

    render(<IntegracoesContent />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Pausada')).toBeInTheDocument();
    expect(screen.queryByText('Ativa')).not.toBeInTheDocument();
  });

  it('exibe estado vazio quando não há conta Meta conectada', async () => {
    mockApi([]);

    render(<IntegracoesContent />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Nenhuma conta de anúncio conectada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Conectar conta Meta/i })).toBeInTheDocument();
  });

  it('envia frontendUrl = window.location.origin ao iniciar o OAuth (volta ao MESMO domínio)', async () => {
    mockApi([]);
    // /meta/auth/url é chamado ao clicar em "Conectar conta"
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/meta/connections') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/meta/auth/url') {
        return Promise.resolve({
          data: { success: true, data: { authUrl: 'https://www.facebook.com/dialog/oauth?state=x' } },
        });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<IntegracoesContent />, { wrapper: makeWrapper() });

    const button = await screen.findByRole('button', { name: /Conectar conta Meta/i });
    await user.click(button);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/meta/auth/url', {
        params: { context: 'settings', frontendUrl: window.location.origin },
      });
    });
  });
});