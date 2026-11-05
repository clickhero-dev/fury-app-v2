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
    { id: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 Klein 4B', description: 'Mais rápido', family: 'flux-2', type: 'image' },
    { id: 'black-forest-labs/flux.2-max', label: 'FLUX.2 Max', description: 'Qualidade', family: 'flux-2', type: 'image' },
    { id: 'black-forest-labs/flux.2-pro', label: 'FLUX.2 Pro', description: 'Alta fidelidade', family: 'flux-2', type: 'image' },
    { id: 'bytedance-seed/seedream-5-0-pro', label: 'Seedream 5.0 Pro', description: 'Realista', family: 'outras', type: 'image' },
  ],
  video: [],
};

const MOCK_LIBRARY = [
  { id: 'm1', kind: 'modelo', url: 'https://cdn/m1.png', created_at: '2026-10-07' },
  { id: 'p1', kind: 'produto', url: 'https://cdn/p1.png', created_at: '2026-10-07' },
  { id: 'p2', kind: 'produto', url: 'https://cdn/p2.png', created_at: '2026-10-07' },
  { id: 'e1', kind: 'equipe', url: 'https://cdn/e1.png', created_at: '2026-10-07' },
];

function renderWithProviders(entry = '/estudio') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CampaignWizardProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
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
      if (url.includes('/brand-kit/library')) {
        return Promise.resolve({ data: { success: true, data: MOCK_LIBRARY } });
      }
      return Promise.resolve({ data: MOCK_ASSETS });
    });
    mockApiPost.mockImplementation((url: string, body?: unknown) => {
      if (url.includes('/enhance-prompt')) {
        return Promise.resolve({ data: { enhancedPrompt: 'prompt melhorado', brand: {} } });
      }
      if (url.includes('/brand-kit/library')) {
        const fd = body as FormData;
        const kind = fd.get('kind') as string;
        const created = fd.getAll('files[]').map((_, i) => ({ id: `novo-${kind}-${i}`, kind, url: `https://cdn/novo-${i}.png`, created_at: '' }));
        return Promise.resolve({ data: { success: true, data: created } });
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
    // sem nome técnico do modelo na UI — só a característica identifica a opção
    expect(screen.getByText('Realista')).toBeInTheDocument();
    expect(screen.getByText('Mais rápido')).toBeInTheDocument();
  });

  it('Gerar imagem usa o modelo selecionado no seletor', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));

    const trigger = await screen.findByRole('button', { name: /modelo de imagem/i });
    await user.click(trigger);
    await user.click(await screen.findByText('Realista'));

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

  it('sem imagens, gera sem modelo nem fotos e passa pelo aprimoramento (comportamento preservado)', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    await user.type(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), 'Anúncio fashion minimalista com luz natural');
    await user.click(screen.getByRole('button', { name: /gerar imagem/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/studio/ai/generate-image', expect.objectContaining({ prompt: 'prompt melhorado' }));
    });
    const body = (mockApiPost as any).mock.calls.find((c: any[]) => c[0] === '/studio/ai/generate-image')[1];
    expect(body.template_photo_id).toBeUndefined();
    expect(body.photo_ids).toBeUndefined();
    expect(mockApiPost).toHaveBeenCalledWith('/studio/ai/enhance-prompt', expect.anything());
  });

  it('com modelo escolhido na lateral: muda o texto da caixa, esconde o seletor de IA e gera sem aprimorar', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    await user.click(await screen.findByRole('button', { name: /usar imagem: modelo/i }));

    expect(screen.getByText('O que muda no modelo?')).toBeInTheDocument();
    expect(screen.getByText('Modelo escolhido')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /modelo de imagem/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/o que muda no modelo/i), 'Empresa DUO Oral Care em Joinville-SC');
    await user.click(screen.getByRole('button', { name: /gerar imagem/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/studio/ai/generate-image',
        expect.objectContaining({ template_photo_id: 'm1', prompt: 'Empresa DUO Oral Care em Joinville-SC' }),
      );
    });
    expect(mockApiPost).not.toHaveBeenCalledWith('/studio/ai/enhance-prompt', expect.anything());
  });

  it('"Enviar modelo" abre a pasta direto, mostra a miniatura para conferir e envia como Modelo', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));

    await user.upload(screen.getByLabelText('Enviar modelo'), new File(['x'], 'vaga-toledo.jpg', { type: 'image/jpeg' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Conferir antes de enviar')).toBeInTheDocument();
    expect(within(dialog).getByText(/esta imagem será salva como modelo/i)).toBeInTheDocument();
    expect(within(dialog).getByText('vaga-toledo.jpg')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /enviar 1 modelo/i }));
    await waitFor(() => expect(screen.getByText('Modelo escolhido')).toBeInTheDocument());
    const call = (mockApiPost as any).mock.calls.find((c: any[]) => c[0] === '/brand-kit/library');
    expect((call[1] as FormData).get('kind')).toBe('modelo');
  });

  it('"Enviar foto" só oferece Produto ou Equipe e aceita no máximo 2 fotos', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    await user.click(screen.getByRole('button', { name: /^enviar foto$/i }));

    const chooser = await screen.findByRole('dialog');
    expect(within(chooser).getByLabelText('Enviar como Produto')).toBeInTheDocument();
    expect(within(chooser).getByLabelText('Enviar como Equipe')).toBeInTheDocument();
    expect(within(chooser).queryByLabelText('Enviar como Modelo')).not.toBeInTheDocument();
    expect(within(chooser).getByText(/no máximo 2 fotos/i)).toBeInTheDocument();

    await user.upload(within(chooser).getByLabelText('Enviar como Produto'), [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
      new File(['c'], 'c.png', { type: 'image/png' }),
    ]);
    const confirm = await screen.findByText('Conferir antes de enviar');
    const dialog = confirm.closest('[role="dialog"]') as HTMLElement;
    expect(within(dialog).getByText(/todas as imagens abaixo serão salvas como produto/i)).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: /tirar esta imagem/i })).toHaveLength(2);
    expect(within(dialog).getByText(/ficaram só as primeiras 2/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /enviar 2 produtos/i }));
    await waitFor(() => expect(screen.getByText('Fotos na arte')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), 'Anúncio do meu produto com luz natural');
    await user.click(screen.getByRole('button', { name: /gerar imagem/i }));
    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/studio/ai/generate-image',
        expect.objectContaining({ photo_ids: ['novo-produto-0', 'novo-produto-1'] }),
      );
    });
    // o aprimoramento sabe que há fotos e de que tipo
    expect(mockApiPost).toHaveBeenCalledWith('/studio/ai/enhance-prompt', expect.objectContaining({ photo_kinds: ['produto', 'produto'] }));
  });

  it('"Enviar imagens" da lateral oferece os 3 tipos, sem limite', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    await user.click(await screen.findByRole('button', { name: /enviar imagens/i }));

    const chooser = await screen.findByRole('dialog');
    expect(within(chooser).getByLabelText('Enviar como Modelo')).toBeInTheDocument();
    expect(within(chooser).getByLabelText('Enviar como Produto')).toBeInTheDocument();
    expect(within(chooser).getByLabelText('Enviar como Equipe')).toBeInTheDocument();
    expect(within(chooser).getByText(/pode enviar quantas quiser/i)).toBeInTheDocument();
  });

  it('envio geral com 22 imagens vai em lotes de 10 (10 + 10 + 2), todas como o tipo escolhido', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    await user.click(await screen.findByRole('button', { name: /enviar imagens/i }));

    const chooser = await screen.findByRole('dialog');
    const files = Array.from({ length: 22 }, (_, i) => new File(['x'], `f${i}.png`, { type: 'image/png' }));
    await user.upload(within(chooser).getByLabelText('Enviar como Produto'), files);
    const dialog = (await screen.findByText('Conferir antes de enviar')).closest('[role="dialog"]') as HTMLElement;
    await user.click(within(dialog).getByRole('button', { name: /enviar 22 produtos/i }));

    await waitFor(() => expect(screen.queryByText('Conferir antes de enviar')).not.toBeInTheDocument());
    const calls = (mockApiPost as any).mock.calls.filter((c: any[]) => c[0] === '/brand-kit/library');
    expect(calls.map((c: any[]) => (c[1] as FormData).getAll('files[]').length)).toEqual([10, 10, 2]);
    expect(calls.every((c: any[]) => (c[1] as FormData).get('kind') === 'produto')).toBe(true);
  });

  it('envio geral que falha no meio avisa quantas foram salvas e mantém só as que faltam', async () => {
    let n = 0;
    const basePost = mockApiPost.getMockImplementation();
    (mockApiPost as any).mockImplementation((url: string, body?: unknown) => {
      if (url === '/brand-kit/library' && ++n === 2) {
        return Promise.reject({ response: { data: { error: { message: 'Cada imagem pode ter no máximo 5MB.' } } } });
      }
      return basePost(url, body);
    });
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    await user.click(await screen.findByRole('button', { name: /enviar imagens/i }));

    const chooser = await screen.findByRole('dialog');
    const files = Array.from({ length: 15 }, (_, i) => new File(['x'], `f${i}.png`, { type: 'image/png' }));
    await user.upload(within(chooser).getByLabelText('Enviar como Equipe'), files);
    const dialog = (await screen.findByText('Conferir antes de enviar')).closest('[role="dialog"]') as HTMLElement;
    await user.click(within(dialog).getByRole('button', { name: /enviar 15 fotos/i }));

    expect(await within(dialog).findByText(/10 de 15 imagens foram salvas/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/no máximo 5MB/i)).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: /tirar esta imagem/i })).toHaveLength(5);
  });

  it('fotos na arte pela lateral: a 3ª substitui a mais antiga (com aviso)', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    const tiles = await screen.findAllByRole('button', { name: /usar imagem: (produto|equipe)/i });
    await user.click(tiles[0]);
    await user.click(tiles[1]);
    await user.click(tiles[2]);

    expect(screen.getAllByRole('button', { name: /remover foto da arte/i })).toHaveLength(2);
    expect(screen.getByText(/limite de 2 fotos na arte/i)).toBeInTheDocument();
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

  it('não exibe tempo de processamento nem custo na tela de resultado', async () => {
    renderWithProviders();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /criação rápida/i }));
    await user.type(screen.getByPlaceholderText(/Ex: Anúncio fashion/i), 'Anúncio fashion minimalista com luz natural');
    await user.click(screen.getByRole('button', { name: /gerar imagem/i }));

    expect((await screen.findAllByText('Seu anúncio')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Tempo de processamento/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Custo da imagem/i)).not.toBeInTheDocument();
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

describe('EstudioHome — deep-link ?criar=rapida (FAB "Criar imagem")', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockResolvedValue({
      data: { assets: [], creativesRemaining: null, creativesLimit: null },
    });
    mockApiPost.mockImplementation(neverResolving);
  });

  it('abre a Criação rápida quando a URL tem ?criar=rapida', async () => {
    renderWithProviders('/estudio?criar=rapida');

    expect(await screen.findByRole('heading', { name: /criação rápida/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('não abre a Criação rápida sem o parâmetro (biblioteca)', async () => {
    renderWithProviders('/estudio');

    expect(await screen.findByRole('heading', { name: /estúdio de anúncios/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /criação rápida/i })).toBeNull();
  });
});
