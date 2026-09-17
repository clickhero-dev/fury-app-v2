import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
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

vi.mock('@/hooks/useBilling', () => ({
  useSubscription: vi.fn(() => ({ data: { currentPeriodEnd: null } })),
}));

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
    { id: 'bytedance-seed/seedream-5-0-pro', label: 'Seedream 5.0 Pro', description: 'ByteDance', category: 'barato', family: 'outras', type: 'image' },
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
    expect(screen.getByTestId('usage-pct').textContent).toContain('10 de 20');
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
    expect(screen.getByTestId('usage-renew').textContent).toMatch(/limite do mês atingido/i);
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
      if (url.includes('/brand-kit/photos')) {
        return Promise.resolve({ data: { data: { urls: ['https://cdn/upload-b.png'] } } });
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

  it('quick-create mostra seletor compacto com grupos (Família FLUX 2 / Outras famílias)', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));

    const trigger = await screen.findByRole('button', { name: /modelo de imagem/i });
    await user.click(trigger);

    expect(await screen.findByText('Família FLUX 2')).toBeInTheDocument();
    expect(screen.getByText('Outras famílias')).toBeInTheDocument();
    expect(screen.getByText(/Seedream 5.0 Pro/)).toBeInTheDocument();
    expect(screen.getByText(/FLUX.2 Klein 4B/)).toBeInTheDocument();
  });

  it('Gerar imagem usa o modelo selecionado no seletor', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));

    const trigger = await screen.findByRole('button', { name: /modelo de imagem/i });
    await user.click(trigger);
    await user.click(await screen.findByText(/Seedream 5.0 Pro/));

    await user.type(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), 'Anúncio fashion minimalista com luz natural');
    await user.click(screen.getByRole('button', { name: /gerar imagem/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/studio/ai/generate-image', expect.objectContaining({ model: 'bytedance-seed/seedream-5-0-pro' }));
    });
  });

  it('sem tocar no seletor de formato, envia aspect_ratio 1:1 (comportamento padrão preservado)', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    await user.type(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), 'Anúncio fashion minimalista com luz natural');
    await user.click(screen.getByRole('button', { name: /gerar imagem/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/studio/ai/generate-image', expect.objectContaining({ aspect_ratio: '1:1' }));
    });
  });

  it('seletor de formato alterna visualmente e selecionar Vertical envia aspect_ratio 9:16', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));

    const quadrado = screen.getByRole('button', { name: /quadrado/i });
    const vertical = screen.getByRole('button', { name: /vertical/i });
    expect(quadrado).toHaveAttribute('aria-pressed', 'true');
    expect(vertical).toHaveAttribute('aria-pressed', 'false');

    await user.click(vertical);
    expect(vertical).toHaveAttribute('aria-pressed', 'true');
    expect(quadrado).toHaveAttribute('aria-pressed', 'false');

    await user.type(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), 'Anúncio fashion minimalista com luz natural');
    await user.click(screen.getByRole('button', { name: /gerar imagem/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/studio/ai/generate-image', expect.objectContaining({ aspect_ratio: '9:16' }));
    });
  });

  it('sem imagem de referência, gera sem reference_image_urls (comportamento preservado)', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    await user.type(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), 'Anúncio fashion minimalista com luz natural');
    await user.click(screen.getByRole('button', { name: /gerar imagem/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/studio/ai/generate-image',
        expect.objectContaining({ reference_image_urls: undefined }),
      );
    });
  });

  it('Upload B envia a foto, mostra miniatura removível e inclui reference_image_urls na geração', async () => {
    const { container } = renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));

    // Upload B fica no formulário principal — vem antes do painel lateral no DOM
    const fileInputs = container.querySelectorAll('input[type="file"]');
    const uploadBInput = fileInputs[0] as HTMLInputElement;
    const file = new File(['conteudo'], 'produto.png', { type: 'image/png' });
    await user.upload(uploadBInput, file);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/brand-kit/photos', expect.any(FormData), expect.anything());
    });
    const removeBtn = await screen.findByRole('button', { name: /remover imagem de referência/i });
    expect(removeBtn).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), 'Anúncio fashion minimalista com luz natural');
    await user.click(screen.getByRole('button', { name: /gerar imagem/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/studio/ai/generate-image',
        expect.objectContaining({ reference_image_urls: ['https://cdn/upload-b.png'] }),
      );
    });

    // remover a miniatura tira ela do contexto
    await user.click(removeBtn);
    expect(screen.queryByRole('button', { name: /remover imagem de referência/i })).not.toBeInTheDocument();
  });

  it('Upload B com mais de 2 arquivos: mostra modal de limite, não envia nada', async () => {
    const { container } = renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));

    const fileInputs = container.querySelectorAll('input[type="file"]');
    const uploadBInput = fileInputs[0] as HTMLInputElement;
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
      new File(['c'], 'c.png', { type: 'image/png' }),
    ];
    await user.upload(uploadBInput, files);

    expect(await screen.findByText(/máximo de 2 fotos por vez/i)).toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalledWith('/brand-kit/photos', expect.anything(), expect.anything());

    await user.click(screen.getByRole('button', { name: /entendi/i }));
    expect(screen.queryByText(/máximo de 2 fotos por vez/i)).not.toBeInTheDocument();
  });

  it('regra de substituição: já com 2 no contexto, novo upload B substitui a mais antiga (com aviso)', async () => {
    const { container } = renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));

    const fileInputs = container.querySelectorAll('input[type="file"]');
    const uploadBInput = fileInputs[0] as HTMLInputElement;

    let callCount = 0;
    (mockApiPost as any).mockImplementation((url: string) => {
      if (url.includes('/brand-kit/photos')) {
        callCount += 1;
        return Promise.resolve({ data: { data: { urls: [`https://cdn/foto-${callCount}.png`] } } });
      }
      if (url.includes('/enhance-prompt')) return Promise.resolve({ data: { enhancedPrompt: 'x', brand: {} } });
      return Promise.resolve({ data: { type: 'image', creativeAssetId: 'a', imageUrl: 'https://cdn/n.png' } });
    });

    await user.upload(uploadBInput, new File(['a'], 'a.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /remover imagem de referência/i })).toHaveLength(1));

    await user.upload(uploadBInput, new File(['b'], 'b.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /remover imagem de referência/i })).toHaveLength(2));

    await user.upload(uploadBInput, new File(['c'], 'c.png', { type: 'image/png' }));
    await waitFor(() => {
      // ainda só 2 miniaturas — a mais antiga foi substituída, não acumulou 3
      expect(screen.getAllByRole('button', { name: /remover imagem de referência/i })).toHaveLength(2);
    });
    expect(screen.getByText(/limite de 2 imagens de referência/i)).toBeInTheDocument();
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

describe('EstudioHome — arquivar criativo (Fase 6)', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiDelete.mockReset();
    mockApiGet.mockResolvedValue({ data: MOCK_ASSETS });
  });

  it('clicar em excluir abre modal de confirmação (não exclui direto)', async () => {
    renderWithProviders();
    const user = userEvent.setup();

    await screen.findByText(/Anúncio de imagem/i);

    const trashBtn = screen.getByTitle(/Excluir anúncio/i);
    await user.click(trashBtn);

    expect(screen.getByText(/Arquivar este criativo\?/i)).toBeInTheDocument();
    expect(mockApiDelete).not.toHaveBeenCalled();
  });

  it('confirmar no modal arquiva o criativo (DELETE) e mostra snack de sucesso', async () => {
    mockApiDelete.mockResolvedValue({ data: { success: true } });
    renderWithProviders();
    const user = userEvent.setup();

    await screen.findByText(/Anúncio de imagem/i);

    const trashBtn = screen.getByTitle(/Excluir anúncio/i);
    await user.click(trashBtn);

    const confirmBtn = screen.getByRole('button', { name: /^Arquivar$/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/Criativo arquivado com sucesso/i)).toBeInTheDocument();
    });

    expect(mockApiDelete).toHaveBeenCalledWith('/studio/assets/asset-1');
  });

  it('cancelar no modal não arquiva nada', async () => {
    renderWithProviders();
    const user = userEvent.setup();

    await screen.findByText(/Anúncio de imagem/i);

    const trashBtn = screen.getByTitle(/Excluir anúncio/i);
    await user.click(trashBtn);

    const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
    await user.click(cancelBtn);

    expect(screen.queryByText(/Arquivar este criativo\?/i)).not.toBeInTheDocument();
    expect(mockApiDelete).not.toHaveBeenCalled();
  });

  it('exibe snack de erro ao falhar o arquivamento', async () => {
    mockApiDelete.mockRejectedValue(new Error('API error'));
    renderWithProviders();
    const user = userEvent.setup();

    await screen.findByText(/Anúncio de imagem/i);

    const trashBtn = screen.getByTitle(/Excluir anúncio/i);
    await user.click(trashBtn);

    const confirmBtn = screen.getByRole('button', { name: /^Arquivar$/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/Erro ao arquivar o criativo/i)).toBeInTheDocument();
    });
  });
});

const MOCK_ARCHIVED_ASSET = {
  id: 'asset-archived-1',
  name: 'Anúncio arquivado',
  type: 'image' as const,
  url: 'https://example.com/archived.png',
  complianceStatus: 'approved' as const,
  complianceNotes: '{}',
  modificationsRemaining: 1,
};

describe('EstudioHome — modal de Arquivados (Fase 6)', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiGet.mockImplementation((_url: string, config?: { params?: { archived?: string } }) => {
      if (config?.params?.archived === 'true') {
        return Promise.resolve({ data: { assets: [MOCK_ARCHIVED_ASSET], creativesRemaining: null, creativesLimit: null } });
      }
      return Promise.resolve({ data: MOCK_ASSETS });
    });
  });

  it('botão "Arquivados" abre modal listando só os arquivados, com "Restaurar anúncio" e sem excluir/usar em campanha', async () => {
    renderWithProviders();
    const user = userEvent.setup();

    await screen.findByText(/Anúncio de imagem/i);
    await user.click(screen.getByRole('button', { name: /^Arquivados$/i }));

    await screen.findByText('Anúncio arquivado');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /Restaurar anúncio/i })).toBeInTheDocument();
    expect(within(dialog).queryByTitle(/Excluir anúncio/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Usar em campanha$/i })).not.toBeInTheDocument();
  });

  it('restaurar chama POST .../restore e atualiza as duas listagens', async () => {
    mockApiPost.mockResolvedValue({ data: { success: true } });
    renderWithProviders();
    const user = userEvent.setup();

    await screen.findByText(/Anúncio de imagem/i);
    await user.click(screen.getByRole('button', { name: /^Arquivados$/i }));
    await screen.findByText('Anúncio arquivado');

    await user.click(screen.getByRole('button', { name: /Restaurar anúncio/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/studio/assets/asset-archived-1/restore');
    });
  });
});
