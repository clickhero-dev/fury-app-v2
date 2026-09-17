import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CreativeStudio } from './CreativeStudio';
import { CampaignWizardProvider } from '@/contexts/CampaignWizardContext';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: {
    defaults: { baseURL: 'http://localhost/api' },
    get: mockApiGet,
    post: mockApiPost,
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const FLUX_2_MODELS = [
  { id: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 Klein 4B', description: 'Rápido', category: 'custo-beneficio', family: 'flux-2', type: 'image' },
  { id: 'black-forest-labs/flux.2-max', label: 'FLUX.2 Max', description: 'Qualidade', category: 'qualidade', family: 'flux-2', type: 'image' },
  { id: 'black-forest-labs/flux.2-pro', label: 'FLUX.2 Pro', description: 'Pro', category: 'qualidade', family: 'flux-2', type: 'image' },
];
const OUTRAS_MODELS = [
  { id: 'bytedance-seed/seedream-5-0-pro', label: 'Seedream 5.0 Pro', description: 'ByteDance — Renderização realista com bom custo-benefício.', category: 'barato', family: 'outras', type: 'image' },
  { id: 'x-ai/grok-imagine-image-2.0', label: 'Grok Imagine 2.0', description: 'xAI', category: 'custo-beneficio', family: 'outras', type: 'image' },
  { id: 'qwen/qwen-image-3-pro', label: 'Qwen Image 3 Pro', description: 'Alibaba', category: 'barato', family: 'outras', type: 'image' },
  { id: 'google/gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image', description: 'Google', category: 'custo-beneficio', family: 'outras', type: 'image' },
];
const VIDEO_MODELS = [
  { id: 'google/veo-3.1-lite', label: 'Veo 3.1 Lite', description: 'Google', category: 'barato', family: 'video', type: 'video' },
];

const MODELS_RESPONSE = { image: [...FLUX_2_MODELS, ...OUTRAS_MODELS], video: VIDEO_MODELS };

const COMPLIANCE_RESPONSE = {
  complianceStatus: 'approved',
  issues: [],
  textPercentage: 0,
  imageUrl: 'https://cdn/a.png',
  createdAt: '2026-09-09T12:00:00.000Z',
};

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CampaignWizardProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </CampaignWizardProvider>
  );
  return render(<CreativeStudio />, { wrapper });
}

describe('CreativeStudio — seletor de modelos, tempo e custo', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/studio/assets/')) {
        return Promise.resolve({ data: COMPLIANCE_RESPONSE });
      }
      return Promise.resolve({ data: MODELS_RESPONSE });
    });
    mockApiPost.mockResolvedValue({
      data: {
        type: 'image',
        creativeAssetId: 'asset-1',
        imageUrl: 'https://cdn/a.png',
        model: 'black-forest-labs/flux.2-klein-4b',
        status: 'pending_compliance',
        costUsd: 0.04,
        processingTimeMs: 3200,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('seletor compacto: combobox com 7 opções agrupadas (FLUX 2 / Outras famílias)', async () => {
      const { container } = renderWithProviders();
      const select = await screen.findByRole('combobox', { name: /modelo de imagem/i });
      // espera o catálogo carregar (fallback tem só 3 opções)
      await waitFor(() => expect(container.querySelectorAll('option')).toHaveLength(7));
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(7);
      // agrupamento por família
      const groups = [...select.querySelectorAll('optgroup')].map((g) => g.label);
      expect(groups).toEqual(['Família FLUX 2', 'Outras famílias']);
      // nenhum modelo Microsoft MAI
      expect(screen.queryByText(/MAI Image 2.5/i)).not.toBeInTheDocument();
      // opções das duas famílias presentes
      expect(screen.getByRole('option', { name: /FLUX.2 Klein 4B/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Seedream 5.0 Pro/ })).toBeInTheDocument();
    });

    it('selecionar modelo de outra família e Gerar envia o model escolhido', async () => {
      const user = userEvent.setup();
      renderWithProviders();
      const select = await screen.findByRole('combobox', { name: /modelo de imagem/i });
      await waitFor(() => expect(screen.getByRole('option', { name: /Seedream 5.0 Pro/ })).toBeInTheDocument());
      fireEvent.change(select, { target: { value: 'bytedance-seed/seedream-5-0-pro' } });
      await user.type(screen.getByPlaceholderText(/Descreva o estilo/i), 'Anúncio fashion minimalista com luz natural');

      const generateBtn = screen.getByRole('button', { name: /Gerar imagem/i });
      await user.click(generateBtn);

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith('/studio/ai/generate-image', expect.objectContaining({ model: 'bytedance-seed/seedream-5-0-pro' }));
      });
    });

    it('mostra a descrição do modelo selecionado abaixo do seletor', async () => {
      renderWithProviders();
      const select = await screen.findByRole('combobox', { name: /modelo de imagem/i });
      await waitFor(() => expect(screen.getByRole('option', { name: /Seedream 5.0 Pro/ })).toBeInTheDocument());
      fireEvent.change(select, { target: { value: 'bytedance-seed/seedream-5-0-pro' } });
      expect(screen.getByText(/ByteDance — Renderização realista/)).toBeInTheDocument();
    });

  it('exibe cronômetro (Xs) enquanto a imagem está sendo gerada', async () => {
    vi.useFakeTimers();
    mockApiPost.mockImplementation(() => new Promise(() => {})); // nunca resolve
    renderWithProviders();
    fireEvent.click(screen.getByRole('button', { name: /Gerar imagem/i }));

    act(() => { vi.advanceTimersByTime(3000); });

    const generatingMessages = screen.getAllByText(/criando seu anúncio/);
    expect(generatingMessages.length).toBeGreaterThan(0);
    for (const el of generatingMessages) {
      expect(el).toHaveTextContent('(3s)');
    }
  });

  it('mostra tempo de processamento e custo quando a imagem fica pronta', async () => {
    const user = userEvent.setup();
    renderWithProviders();
    await user.click(screen.getByRole('button', { name: /Gerar imagem/i }));

    expect(await screen.findByText(/Tempo de processamento/i)).toBeInTheDocument();
    expect(screen.getByText(/3,2s/)).toBeInTheDocument();
    expect(screen.getByText(/US\$ 0,04/)).toBeInTheDocument();
  });

  it('oculta o custo quando o OpenRouter não retorna usage.cost', async () => {
    mockApiPost.mockResolvedValue({
      data: {
        type: 'image',
        creativeAssetId: 'asset-1',
        imageUrl: 'https://cdn/a.png',
        model: 'black-forest-labs/flux.2-klein-4b',
        status: 'pending_compliance',
        costUsd: null,
        processingTimeMs: 2100,
      },
    });
    const user = userEvent.setup();
    renderWithProviders();
    await user.click(screen.getByRole('button', { name: /Gerar imagem/i }));

    expect(await screen.findByText(/Tempo de processamento/i)).toBeInTheDocument();
    expect(screen.getByText(/2,1s/)).toBeInTheDocument();
    expect(screen.queryByText(/US\$/)).not.toBeInTheDocument();
  });
});