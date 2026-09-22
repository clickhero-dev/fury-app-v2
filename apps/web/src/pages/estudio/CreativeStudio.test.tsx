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
  { id: 'bytedance-seed/seedream-5.0-pro', label: 'Seedream 5.0 Pro', description: 'ByteDance', category: 'barato', family: 'outras', type: 'image' },
  { id: 'recraft/recraft-v4.1-pro', label: 'Recraft v4.1 Pro', description: 'Recraft', category: 'qualidade', family: 'outras', type: 'image' },
  { id: 'x-ai/grok-imagine-image-2.0', label: 'Grok Imagine 2.0', description: 'xAI', category: 'custo-beneficio', family: 'outras', type: 'image' },
  { id: 'qwen/qwen-image-3-pro', label: 'Qwen Image 3 Pro', description: 'Alibaba', category: 'barato', family: 'outras', type: 'image' },
  { id: 'openai/gpt-image-1', label: 'GPT Image 1', description: 'OpenAI — Referência em fidelidade ao prompt e texto.', category: 'qualidade', family: 'outras', type: 'image' },
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

  it('seletor de IAs oculto: sem combobox de modelo na tela', async () => {
      renderWithProviders();
      await waitFor(() => expect(screen.getByRole('button', { name: /Gerar imagem/i })).toBeInTheDocument());
      // OCULTO: seletor de modelos removido da UI — nenhum combobox presente
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('Gerar imagem envia o modelo fixo qwen/qwen-image-3-pro (seletor oculto)', async () => {
      const user = userEvent.setup();
      renderWithProviders();
      await user.type(screen.getByPlaceholderText(/Descreva o estilo/i), 'Anúncio fashion minimalista com luz natural');

      const generateBtn = screen.getByRole('button', { name: /Gerar imagem/i });
      await user.click(generateBtn);

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith('/studio/ai/generate-image', expect.objectContaining({ model: 'qwen/qwen-image-3-pro' }));
      });
    });

    it('não consulta o catálogo de modelos (/studio/ai/models) com o seletor oculto', async () => {
      renderWithProviders();
      await waitFor(() => expect(screen.getByRole('button', { name: /Gerar imagem/i })).toBeInTheDocument());
      // OCULTO: nenhum fetch de catálogo deve acontecer
      expect(mockApiGet).not.toHaveBeenCalledWith('/studio/ai/models');
      expect(mockApiGet).not.toHaveBeenCalled();
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