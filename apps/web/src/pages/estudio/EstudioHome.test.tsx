import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EstudioHome } from './EstudioHome';
import { CampaignWizardProvider } from '@/contexts/CampaignWizardContext';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiDelete = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn() as any);
const neverResolving = vi.hoisted(() => () => new Promise(() => {}));

vi.mock('@/lib/api', () => ({
  default: {
    defaults: { baseURL: 'http://localhost/api' },
    get: mockApiGet,
    post: mockApiPost,
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

const MOCK_MODELS = {
  image: [
    { id: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 Klein 4B', description: 'Rápido', category: 'custo-beneficio', family: 'flux-2', type: 'image' },
    { id: 'black-forest-labs/flux.2-max', label: 'FLUX.2 Max', description: 'Qualidade', category: 'qualidade', family: 'flux-2', type: 'image' },
    { id: 'black-forest-labs/flux.2-pro', label: 'FLUX.2 Pro', description: 'Pro', category: 'qualidade', family: 'flux-2', type: 'image' },
    { id: 'openai/gpt-image-1', label: 'GPT Image 1', description: 'OpenAI', category: 'qualidade', family: 'outras', type: 'image' },
    { id: 'bytedance-seed/seedream-5.0-pro', label: 'Seedream 5.0 Pro', description: 'ByteDance', category: 'barato', family: 'outras', type: 'image' },
  ],
  video: [],
};

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CampaignWizardProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </CampaignWizardProvider>
  );
  return render(<EstudioHome />, { wrapper });
}

describe('EstudioHome — mensagem de tempo de geração de imagem', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockResolvedValue({
      data: { assets: [], creativesRemaining: null, creativesLimit: null },
    });
    mockApiPost.mockImplementation(neverResolving);
  });

  it('exibe badge de consumo de cota (usados de total) quando quota conhecida', async () => {
    mockApiGet.mockResolvedValue({ data: MOCK_ASSETS });
    renderWithProviders();

    const badge = await screen.findByTestId('usage-badge');
    expect(badge.getAttribute('data-tone')).toBe('normal');
    expect(screen.getByTestId('usage-label').textContent).toContain('10/20 usados');
    expect(screen.getByTestId('usage-bar')).toBeInTheDocument();
  });

  it('badge some quando quota desconhecida (null) — comportamento preservado', async () => {
    renderWithProviders();

    await screen.findByRole('button', { name: /criação rápida/i });
    expect(screen.queryByTestId('usage-badge')).not.toBeInTheDocument();
  });

  it('badge em tom de erro + CTA upgrade quando cota zerada', async () => {
    mockApiGet.mockResolvedValue({
      data: { assets: [], creativesRemaining: 0, creativesLimit: 20 },
    });
    renderWithProviders();

    const badge = await screen.findByTestId('usage-badge');
    expect(badge.getAttribute('data-tone')).toBe('error');
    expect(screen.getByTestId('usage-label').textContent).toMatch(/limite do mês atingido/i);
    expect(screen.getByTestId('usage-upgrade-cta')).toBeInTheDocument();
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

describe('EstudioHome — seletor de modelos na criação rápida', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/studio/ai/models')) {
        return Promise.resolve({ data: MOCK_MODELS });
      }
      return Promise.resolve({ data: MOCK_ASSETS });
    });
    mockApiPost.mockImplementation((url: string) => {
      if (url.includes('/enhance-prompt')) {
        return Promise.resolve({ data: { enhancedPrompt: 'prompt melhorado', brand: {} } });
      }
      return Promise.resolve({ data: { type: 'image', creativeAssetId: 'asset-new', imageUrl: 'https://cdn/n.png', costUsd: 0.04, processingTimeMs: 3200 } });
    });
    // jsdom não implementa canvas — CreativeResult usa clearRect no mount
    HTMLCanvasElement.prototype.getContext = (() => ({ clearRect: vi.fn() })) as any;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.useRealTimers();
  });

  it('quick-create mostra seletor compacto com optgroups (Família FLUX 2 / Outras famílias)', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));

    const select = await screen.findByRole('combobox', { name: /modelo de imagem/i });
    const groups = [...select.querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual(['Família FLUX 2', 'Outras famílias']);
    expect(screen.getByRole('option', { name: /GPT Image 1/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /FLUX.2 Klein 4B/ })).toBeInTheDocument();
  });

  it('Gerar imagem usa o modelo selecionado no seletor', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    const select = await screen.findByRole('combobox', { name: /modelo de imagem/i });
    fireEvent.change(select, { target: { value: 'openai/gpt-image-1' } });
    await user.type(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), 'Anúncio fashion minimalista com luz natural');
    await user.click(screen.getByRole('button', { name: /gerar imagem/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/studio/ai/generate-image', expect.objectContaining({ model: 'openai/gpt-image-1' }));
    });
  });

  it('mostra cronômetro (Xs) desde o clique, mesmo durante o enhance-prompt', async () => {
    vi.useFakeTimers();
    mockApiPost.mockImplementation(() => new Promise(() => {})); // enhance nunca resolve
    renderWithProviders();
    fireEvent.click(screen.getByRole('button', { name: /criação rápida/i }));
    fireEvent.change(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), {
      target: { value: 'Anúncio fashion minimalista com luz natural' },
    });
    fireEvent.click(screen.getByRole('button', { name: /gerar imagem/i }));

    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.getByText(/\(3s\)/)).toBeInTheDocument();
  });

  it('mostra cronômetro (Xs) na tela de loading enquanto gera', async () => {
    vi.useFakeTimers();
    // enhance-prompt resolve; generate-image fica pendente (cronômetro ativo)
    mockApiPost.mockImplementation((url: string) =>
      url.includes('/enhance-prompt')
        ? Promise.resolve({ data: { enhancedPrompt: 'prompt melhorado', brand: {} } })
        : new Promise(() => {}),
    );
    renderWithProviders();
    fireEvent.click(screen.getByRole('button', { name: /criação rápida/i }));
    fireEvent.change(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), {
      target: { value: 'Anúncio fashion minimalista com luz natural' },
    });
    fireEvent.click(screen.getByRole('button', { name: /gerar imagem/i }));

    // flush microtasks: enhance → mutate → onMutate (startedAt)
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.getByText(/\(3s\)/)).toBeInTheDocument();
  });

  it('mostra tempo de processamento e custo quando a imagem fica pronta', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    await user.type(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), 'Anúncio fashion minimalista com luz natural');
    await user.click(screen.getByRole('button', { name: /gerar imagem/i }));

    expect(await screen.findByText(/Tempo de processamento/i)).toBeInTheDocument();
    expect(screen.getByText(/3,2s/)).toBeInTheDocument();
    expect(screen.getByText(/US\$ 0,04/)).toBeInTheDocument();
  });

  it('oculta o custo quando o OpenRouter não retorna usage.cost', async () => {
    mockApiPost.mockImplementation((url: string) => {
      if (url.includes('/enhance-prompt')) {
        return Promise.resolve({ data: { enhancedPrompt: 'prompt melhorado', brand: {} } });
      }
      return Promise.resolve({ data: { type: 'image', creativeAssetId: 'asset-new', imageUrl: 'https://cdn/n.png', costUsd: null, processingTimeMs: 2100 } });
    });
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    await user.type(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), 'Anúncio fashion minimalista com luz natural');
    await user.click(screen.getByRole('button', { name: /gerar imagem/i }));

    expect(await screen.findByText(/Tempo de processamento/i)).toBeInTheDocument();
    expect(screen.getByText(/2,1s/)).toBeInTheDocument();
    expect(screen.queryByText(/US\$/)).not.toBeInTheDocument();
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
