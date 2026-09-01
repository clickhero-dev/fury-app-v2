import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EstudioHome } from './EstudioHome';

const mockApiGet = vi.hoisted(() => vi.fn());
// Promise que nunca resolve para manter a view de loading estável durante o teste.
const neverResolving = vi.hoisted(() => () => new Promise(() => {}));

vi.mock('@/lib/api', () => ({
  default: {
    defaults: { baseURL: 'http://localhost/api' },
    get: mockApiGet,
    post: neverResolving,
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/components/campaign-wizard/CampaignWizard', () => ({
  CampaignWizard: () => null,
}));

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<EstudioHome />, { wrapper });
}

describe('EstudioHome — mensagem de tempo de geração de imagem', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockResolvedValue({
      data: { assets: [], creativesRemaining: null, creativesLimit: null },
    });
  });

  it('exibe o novo texto de duração (1 a 2 minutos) na tela de loading', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    // Biblioteca inicial carrega
    const quickCreateBtn = await screen.findByRole('button', { name: /criação rápida/i });
    await user.click(quickCreateBtn);

    // Digita um prompt válido (>= 10 caracteres)
    const textarea = screen.getByPlaceholderText(/Ex: Anúncio fashion/i);
    await user.type(textarea, 'Anúncio fashion minimalista com luz natural');

    // Dispara a geração
    const generateBtn = screen.getByRole('button', { name: /gerar imagem/i });
    await user.click(generateBtn);

    // O texto novo deve aparecer na tela de loading
    await waitFor(() => {
      expect(
        screen.getByText(/a geração com ia e a renderização podem levar de 1 a 2 minutos/i)
      ).toBeInTheDocument();
    });

    // O texto antigo não deve mais existir
    expect(
      screen.queryByText(/levar até 15 segundos/i)
    ).not.toBeInTheDocument();
  });
});