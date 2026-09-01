import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EstudioHome } from './EstudioHome';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiDelete = vi.hoisted(() => vi.fn());
const neverResolving = vi.hoisted(() => () => new Promise(() => {}));

vi.mock('@/lib/api', () => ({
  default: {
    defaults: { baseURL: 'http://localhost/api' },
    get: mockApiGet,
    post: neverResolving,
    put: vi.fn(),
    patch: vi.fn(),
    delete: mockApiDelete,
  },
}));

vi.mock('@/components/campaign-wizard/CampaignWizard', () => ({
  CampaignWizard: () => null,
}));

const MOCK_ASSETS = {
  assets: [
    {
      id: 'asset-1',
      name: 'Anúncio de imagem',
      type: 'image' as const,
      url: 'https://example.com/ad1.png',
      complianceStatus: 'approved' as const,
      complianceNotes: '{}',
      modificationsRemaining: 3,
    },
  ],
  creativesRemaining: 10,
  creativesLimit: 20,
};

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

    const quickCreateBtn = await screen.findByRole('button', { name: /criação rápida/i });
    await user.click(quickCreateBtn);

    const textarea = screen.getByPlaceholderText(/Ex: Anúncio fashion/i);
    await user.type(textarea, 'Anúncio fashion minimalista com luz natural');

    const generateBtn = screen.getByRole('button', { name: /gerar imagem/i });
    await user.click(generateBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/a geração com ia e a renderização podem levar de 1 a 2 minutos/i)
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/levar até 15 segundos/i)
    ).not.toBeInTheDocument();
  });
});

describe('EstudioHome — exclusão de criativo', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiDelete.mockReset();
    mockApiGet.mockResolvedValue({ data: MOCK_ASSETS });
  });

  it('exibe snack de sucesso ao excluir criativo', async () => {
    mockApiDelete.mockResolvedValue({ data: { success: true } });
    renderWithProviders();
    const user = userEvent.setup();

    // Aguarda assets aparecerem na tela
    await screen.findByText(/Anúncio de imagem/i);

    // Clica no ícone de lixeira
    const trashBtn = screen.getByTitle(/Excluir anúncio/i);
    await user.click(trashBtn);

    // Confirma a exclusão
    const confirmBtn = screen.getByRole('button', { name: /Confirmar/i });
    await user.click(confirmBtn);

    // SnackBar de sucesso deve aparecer
    await waitFor(() => {
      expect(screen.getByText(/Criativo excluído com sucesso/i)).toBeInTheDocument();
    });

    expect(mockApiDelete).toHaveBeenCalledWith('/studio/assets/asset-1');
  });

  it('exibe snack de erro ao falhar exclusão do criativo', async () => {
    mockApiDelete.mockRejectedValue(new Error('API error'));
    renderWithProviders();
    const user = userEvent.setup();

    await screen.findByText(/Anúncio de imagem/i);

    const trashBtn = screen.getByTitle(/Excluir anúncio/i);
    await user.click(trashBtn);

    const confirmBtn = screen.getByRole('button', { name: /Confirmar/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/Erro ao excluir o criativo/i)).toBeInTheDocument();
    });
  });
});
