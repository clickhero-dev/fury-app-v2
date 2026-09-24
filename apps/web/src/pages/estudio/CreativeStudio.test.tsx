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
  { id: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 Klein 4B', description: 'Mais rápido', family: 'flux-2', type: 'image' },
  { id: 'black-forest-labs/flux.2-max', label: 'FLUX.2 Max', description: 'Qualidade', family: 'flux-2', type: 'image' },
  { id: 'black-forest-labs/flux.2-pro', label: 'FLUX.2 Pro', description: 'Alta fidelidade', family: 'flux-2', type: 'image' },
];
const OUTRAS_MODELS = [
  { id: 'bytedance-seed/seedream-5-0-pro', label: 'Seedream 5.0 Pro', description: 'Realista', family: 'outras', type: 'image' },
  { id: 'x-ai/grok-imagine-image-2.0', label: 'Grok Imagine 2.0', description: 'Estilo fotográfico', family: 'outras', type: 'image' },
  { id: 'qwen/qwen-image-3-pro', label: 'Qwen Image 3 Pro', description: 'Detalhes e texto', family: 'outras', type: 'image' },
  { id: 'google/gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image', description: 'Mais nítido', family: 'outras', type: 'image' },
];
const VIDEO_MODELS = [
  { id: 'google/veo-3.1-lite', label: 'Veo 3.1 Lite', description: 'Ágil e versátil', family: 'video', type: 'video' },
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

describe('CreativeStudio — seletor de modelos', () => {
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
      // opções identificadas só pela característica — sem nome técnico do modelo
      expect(screen.getByRole('option', { name: 'Mais rápido' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Realista' })).toBeInTheDocument();
    });

    it('selecionar modelo de outra família e Gerar envia o model escolhido', async () => {
      const user = userEvent.setup();
      renderWithProviders();
      const select = await screen.findByRole('combobox', { name: /modelo de imagem/i });
      await waitFor(() => expect(screen.getByRole('option', { name: 'Realista' })).toBeInTheDocument());
      fireEvent.change(select, { target: { value: 'bytedance-seed/seedream-5-0-pro' } });
      await user.type(screen.getByPlaceholderText(/Descreva o estilo/i), 'Anúncio fashion minimalista com luz natural');

      const generateBtn = screen.getByRole('button', { name: /Gerar imagem/i });
      await user.click(generateBtn);

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith('/studio/ai/generate-image', expect.objectContaining({ model: 'bytedance-seed/seedream-5-0-pro' }));
      });
    });

    it('select mostra a descrição do modelo selecionado (sem nome técnico)', async () => {
      renderWithProviders();
      const select = await screen.findByRole('combobox', { name: /modelo de imagem/i }) as HTMLSelectElement;
      await waitFor(() => expect(screen.getByRole('option', { name: 'Realista' })).toBeInTheDocument());
      fireEvent.change(select, { target: { value: 'bytedance-seed/seedream-5-0-pro' } });
      expect(select.value).toBe('bytedance-seed/seedream-5-0-pro');
      expect(screen.getByRole('option', { name: 'Realista', selected: true })).toBeInTheDocument();
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

  it('não exibe tempo de processamento nem custo quando a imagem fica pronta', async () => {
    const user = userEvent.setup();
    renderWithProviders();
    await user.click(screen.getByRole('button', { name: /Gerar imagem/i }));

    expect(await screen.findByText(/Explicação detalhada sobre seu anúncio/i)).toBeInTheDocument();
    expect(screen.queryByText(/Tempo de processamento/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Custo da imagem/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/US\$/)).not.toBeInTheDocument();
  });
});