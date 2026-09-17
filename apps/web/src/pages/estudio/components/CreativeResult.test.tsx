import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CreativeResult } from './CreativeResult';
import type { GenerateCreativeResponse } from '@/types/studio';

const mockApiPost = vi.hoisted(() => vi.fn() as any);

vi.mock('@/lib/api', () => ({
  default: {
    defaults: { baseURL: 'http://localhost/api' },
    get: vi.fn(),
    post: mockApiPost,
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const BASE_RESULT: GenerateCreativeResponse = {
  type: 'image',
  assetId: 'v1',
  imageUrl: 'https://example.com/v1.png',
  creativeData: { headline: 'Compre agora', primary_text: '', cta: 'Saiba mais' },
  modificationsRemaining: 3,
  complianceStatus: 'approved',
  complianceNotes: null,
};

const GROUP_3_VERSIONS = {
  groupId: 'v1',
  activeVersionId: 'v1',
  archivedAt: null,
  versions: [
    { id: 'v1', url: 'https://example.com/v1.png', complianceStatus: 'approved', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'v2', url: 'https://example.com/v2.png', complianceStatus: 'rejected', createdAt: '2026-01-02T00:00:00Z' },
    { id: 'v3', url: 'https://example.com/v3.png', complianceStatus: 'pending_compliance', createdAt: '2026-01-03T00:00:00Z' },
  ],
};

function renderWithProviders(result: GenerateCreativeResponse = BASE_RESULT) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    <CreativeResult result={result} onBack={() => {}} onNewCreative={() => {}} />,
    { wrapper },
  );
}

describe('CreativeResult — carrossel de histórico (Fase 5)', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    // jsdom não implementa canvas 2D de verdade — o componente usa um
    // <canvas> pra pintura de máscara (inpainting), pré-existente, sem
    // relação com o carrossel. Stub mínimo só pra não quebrar a montagem.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it('carrega o histórico ao montar (set-active na versão inicial) e mostra a numeração', async () => {
    mockApiPost.mockImplementation((url: string) => {
      if (url === '/studio/assets/v1/set-active') {
        return Promise.resolve({ data: GROUP_3_VERSIONS });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders();

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/studio/assets/v1/set-active');
    });

    expect(await screen.findByRole('tab', { name: /versão 1 de 3/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /versão 2 de 3/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /versão 3 de 3/i })).toBeInTheDocument();
  });

  it('clicar num número troca a imagem exibida na hora e chama set-active com a nova versão', async () => {
    mockApiPost.mockImplementation((url: string) => {
      if (url === '/studio/assets/v1/set-active') return Promise.resolve({ data: GROUP_3_VERSIONS });
      if (url === '/studio/assets/v2/set-active') {
        return Promise.resolve({ data: { ...GROUP_3_VERSIONS, activeVersionId: 'v2' } });
      }
      return Promise.resolve({ data: {} });
    });

    const user = userEvent.setup();
    renderWithProviders();

    await screen.findByRole('tab', { name: /versão 1 de 3/i });
    const image = screen.getByAltText('Criativo gerado') as HTMLImageElement;
    expect(image.src).toBe('https://example.com/v1.png');

    await user.click(screen.getByRole('tab', { name: /versão 2 de 3/i }));

    // Troca instantânea (otimista, a partir de versions[] já carregado) — não espera o roundtrip
    expect(image.src).toBe('https://example.com/v2.png');
    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/studio/assets/v2/set-active');
    });
  });

  it('setas de anterior/próximo navegam entre versões e ficam desabilitadas nas pontas', async () => {
    mockApiPost.mockImplementation((url: string) => {
      if (url === '/studio/assets/v1/set-active') return Promise.resolve({ data: GROUP_3_VERSIONS });
      if (url === '/studio/assets/v2/set-active') return Promise.resolve({ data: { ...GROUP_3_VERSIONS, activeVersionId: 'v2' } });
      if (url === '/studio/assets/v3/set-active') return Promise.resolve({ data: { ...GROUP_3_VERSIONS, activeVersionId: 'v3' } });
      return Promise.resolve({ data: {} });
    });

    const user = userEvent.setup();
    renderWithProviders();

    await screen.findByRole('tab', { name: /versão 1 de 3/i });
    const image = screen.getByAltText('Criativo gerado') as HTMLImageElement;

    const previous = screen.getByRole('button', { name: /versão anterior/i });
    const next = screen.getByRole('button', { name: /próxima versão/i });

    // Na primeira versão, "anterior" fica desabilitado
    expect(previous).toBeDisabled();
    expect(next).not.toBeDisabled();

    await user.click(next);
    expect(image.src).toBe('https://example.com/v2.png');
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/studio/assets/v2/set-active'));

    await user.click(next);
    expect(image.src).toBe('https://example.com/v3.png');
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/studio/assets/v3/set-active'));

    // Na última versão, "próxima" fica desabilitado
    expect(next).toBeDisabled();
    expect(previous).not.toBeDisabled();

    await user.click(previous);
    expect(image.src).toBe('https://example.com/v2.png');
  });

  it('o selo de compliance troca junto com a versão selecionada', async () => {
    mockApiPost.mockImplementation((url: string) => {
      if (url === '/studio/assets/v1/set-active') return Promise.resolve({ data: GROUP_3_VERSIONS });
      if (url === '/studio/assets/v2/set-active') return Promise.resolve({ data: { ...GROUP_3_VERSIONS, activeVersionId: 'v2' } });
      return Promise.resolve({ data: {} });
    });

    const user = userEvent.setup();
    renderWithProviders();

    await screen.findByRole('tab', { name: /versão 1 de 3/i });
    expect(screen.getByText('Aprovado')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /versão 2 de 3/i }));

    await waitFor(() => {
      expect(screen.getByText('Reprovado pelo compliance')).toBeInTheDocument();
    });
    expect(screen.queryByText('Aprovado')).not.toBeInTheDocument();
  });

  it('quando o grupo está arquivado, a seção de "Regenerar com ajuste" não aparece', async () => {
    mockApiPost.mockImplementation((url: string) => {
      if (url === '/studio/assets/v1/set-active') {
        return Promise.resolve({ data: { ...GROUP_3_VERSIONS, archivedAt: '2026-02-01T00:00:00Z' } });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders();

    await screen.findByRole('tab', { name: /versão 1 de 3/i });

    expect(screen.queryByText(/Deseja incluir mais alguma coisa/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Regenerar com ajuste/i })).not.toBeInTheDocument();
  });

  it('sem histórico (grupo com 1 versão só), não mostra numeração nenhuma', async () => {
    mockApiPost.mockImplementation((url: string) => {
      if (url === '/studio/assets/v1/set-active') {
        return Promise.resolve({
          data: { groupId: 'v1', activeVersionId: 'v1', archivedAt: null, versions: [GROUP_3_VERSIONS.versions[0]] },
        });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders();

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/studio/assets/v1/set-active');
    });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
