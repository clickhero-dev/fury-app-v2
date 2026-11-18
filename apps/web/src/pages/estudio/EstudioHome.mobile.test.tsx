import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampaignWizardProvider } from '@/contexts/CampaignWizardContext';
import { EstudioHome } from './EstudioHome';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn(), defaults: {} }));
const state = vi.hoisted(() => ({ blocked: [] as string[], remaining: 3, videoRemaining: 3, optionsError: false }));
vi.mock('@/lib/api', () => ({ default: api }));
vi.mock('@/hooks/useBilling', () => ({ useSubscription: () => ({ data: null }) }));
vi.mock('@/hooks/useBlockedViews', () => ({
  useBlockedViews: () => ({ isBlocked: (key: string) => state.blocked.includes(key) }),
}));
vi.mock('@/components/campaign-wizard/CampaignWizard', () => ({ CampaignWizard: () => null }));
const prompt = 'Anúncio de café gelado para o lançamento da nossa loja';
const scenes = [{ start: 0, end: 15, visual: 'Café gelado sobre a mesa', narration: 'Conheça nosso café' }];
function setup(entry = '/estudio?criar=rapida') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <CampaignWizardProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[entry]}>
          <EstudioHome />
        </MemoryRouter>
      </QueryClientProvider>
    </CampaignWizardProvider>,
  );
}
async function video() {
  setup('/estudio');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Criação rápida', exact: true }));
  await user.click(await screen.findByRole('button', { name: 'Vídeo', exact: true }));
  return user;
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { blocked: [], remaining: 3, videoRemaining: 3, optionsError: false });
  api.get.mockImplementation(async (url: string) => {
    if (url === '/studio/assets')
      return { data: { assets: [], creativesRemaining: state.remaining, creativesLimit: 10 } };
    if (url === '/studio/ai/models') return { data: { image: [], video: [] } };
    if (url === '/studio/video/jobs') return { data: { jobs: [] } };
    if (url === '/brand-kit/library') return { data: { data: [] } };
    if (url === '/studio/video/options') {
      if (state.optionsError) throw new Error('offline');
      return {
        data: { enabled: true, durations: [15], maxPhotos: 4, videosRemaining: state.videoRemaining, videosLimit: 10 },
      };
    }
    return { data: {} };
  });
  api.post.mockImplementation(async (url: string) => {
    if (url === '/studio/video/script') return { data: { scenes } };
    if (url === '/studio/ai/enhance-prompt') return { data: { enhancedPrompt: prompt } };
    return new Promise(() => {});
  });
});
describe('Funcionalidade: orientar criação mobile sem mudar geração', () => {
  it('Dado o deep-link, quando abre imagem, então distingue pedido, referências opcionais e configurações', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Criar imagem', exact: true })).toBeVisible();
    expect(screen.getByLabelText('Descreva o anúncio')).toHaveAccessibleDescription(/pelo menos 10 caracteres/i);
    const summary = screen.getByText('Referências de imagem');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(summary.closest('summary')).toHaveTextContent('Opcional');
    expect(screen.getByRole('heading', { name: 'Configurações da imagem' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Gerar imagem', exact: true })).toBeDisabled();
  });
  it('Dado um pedido de imagem, quando alterna Vídeo e volta, então reflete o modo e conserva descrição', async () => {
    const user = await video();
    expect(screen.getByRole('heading', { name: 'Criar vídeo', exact: true })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Vídeo', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Imagem', exact: true }));
    fireEvent.change(screen.getByLabelText('Descreva o anúncio'), { target: { value: prompt } });
    await user.click(screen.getByRole('button', { name: 'Vídeo', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Imagem', exact: true }));
    expect(screen.getByLabelText('Descreva o anúncio')).toHaveValue(prompt);
    expect(api.post).not.toHaveBeenCalled();
  });
  it('Dado entrada curta ou cota zerada, quando tenta criar imagem, então mantém bloqueio', async () => {
    state.remaining = 0;
    setup();
    const field = await screen.findByLabelText('Descreva o anúncio');
    fireEvent.change(field, { target: { value: 'curto' } });
    expect(screen.getByRole('button', { name: 'Gerar imagem' })).toBeDisabled();
    fireEvent.change(field, { target: { value: prompt } });
    expect(screen.getByRole('button', { name: 'Gerar imagem' })).toBeDisabled();
    expect(screen.getByText(/Limite de criativos do mês atingido/)).toBeVisible();
    expect(api.post).not.toHaveBeenCalled();
  });
  it('Dado vídeo, quando gera roteiro, então revisa antes do arquivo e envia edições, formato e duração', async () => {
    const user = await video();
    const steps = screen.getByRole('list', { name: 'Etapas da criação de vídeo' });
    expect(within(steps).getByText('Descrever').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByRole('button', { name: 'Gerar vídeo', exact: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Gerar roteiro', exact: true })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Sobre o que é o vídeo'), { target: { value: prompt } });
    await user.click(screen.getByRole('button', { name: /Horizontal/ }));
    await user.click(screen.getByRole('button', { name: 'Gerar roteiro', exact: true }));
    expect(await screen.findByRole('heading', { name: 'Revise o roteiro' })).toHaveFocus();
    expect(within(steps).getByText('Revisar roteiro').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(api.post).toHaveBeenCalledWith('/studio/video/script', {
      prompt,
      photoIds: [],
      aspectRatio: '16:9',
      duration: 15,
    });
    expect(api.post).not.toHaveBeenCalledWith('/studio/video/jobs', expect.anything());
    fireEvent.change(screen.getByLabelText('O que aparece'), { target: { value: 'Nova cena editada' } });
    fireEvent.change(screen.getByLabelText('Fala (narração)'), { target: { value: 'Peça agora' } });
    await user.click(screen.getByRole('button', { name: 'Gerar vídeo', exact: true }));
    expect(api.post).toHaveBeenCalledWith('/studio/video/jobs', {
      prompt,
      photoIds: [],
      aspectRatio: '16:9',
      duration: 15,
      scenes: [{ ...scenes[0], visual: 'Nova cena editada', narration: 'Peça agora' }],
    });
    expect(screen.getByRole('button', { name: 'Gerar vídeo', exact: true })).toBeDisabled();
    expect(within(steps).getByText('Gerar vídeo').closest('li')).toHaveAttribute('aria-current', 'step');
  });
  it('Dado roteiro, quando cena fica inválida ou fala longa, então mantém validação e aviso', async () => {
    const user = await video();
    fireEvent.change(screen.getByLabelText('Sobre o que é o vídeo'), { target: { value: prompt } });
    await user.click(screen.getByRole('button', { name: 'Gerar roteiro', exact: true }));
    fireEvent.change(await screen.findByLabelText('O que aparece'), { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Gerar vídeo', exact: true })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Fala (narração)'), { target: { value: 'palavra '.repeat(50) } });
    expect(screen.getByText(/Fala longa para 15s/)).toBeVisible();
    expect(api.post).not.toHaveBeenCalledWith('/studio/video/jobs', expect.anything());
  });
  it('Dado falha no roteiro, quando tenta novamente, então mantém descrição e recupera revisão', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'Tente novamente em instantes' } } } });
    const user = await video();
    fireEvent.change(screen.getByLabelText('Sobre o que é o vídeo'), { target: { value: prompt } });
    await user.click(screen.getByRole('button', { name: 'Gerar roteiro', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tente novamente em instantes');
    expect(screen.getByLabelText('Sobre o que é o vídeo')).toHaveValue(prompt);
    await user.click(screen.getByRole('button', { name: 'Gerar roteiro', exact: true }));
    expect(await screen.findByRole('heading', { name: 'Revise o roteiro' })).toBeVisible();
  });
  it('Dado saldo de vídeo zerado, quando descreve, então não escreve roteiro nem gera arquivo', async () => {
    state.videoRemaining = 0;
    const user = await video();
    fireEvent.change(screen.getByLabelText('Sobre o que é o vídeo'), { target: { value: prompt } });
    const button = screen.getByRole('button', { name: 'Gerar roteiro', exact: true });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(api.post).not.toHaveBeenCalled();
  });
  it('Dado opções indisponíveis, quando abre criação, então não oferece vídeo', async () => {
    state.optionsError = true;
    setup();
    await screen.findByLabelText('Descreva o anúncio');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/studio/video/options'));
    expect(screen.queryByRole('button', { name: 'Vídeo', exact: true })).toBeNull();
  });
  it('Dado plano sem imagem, quando cria na biblioteca, então mantém só formulário de vídeo', async () => {
    state.blocked = ['studio.image'];
    setup('/estudio');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Criação rápida', exact: true }));
    expect(await screen.findByRole('heading', { name: 'Criar vídeo', exact: true })).toBeVisible();
    expect(screen.queryByLabelText('Descreva o anúncio')).toBeNull();
  });
});

describe('Exceções durante os passos da criação', () => {
  it('Dado roteiro em processamento, quando toca de novo, então impede duplicidade e informa carregamento', async () => {
    api.post.mockImplementation(() => new Promise(() => {}));
    const user = await video();
    fireEvent.change(screen.getByLabelText('Sobre o que é o vídeo'), { target: { value: prompt } });
    await user.click(screen.getByRole('button', { name: 'Gerar roteiro', exact: true }));
    const pending = screen.getByRole('button', { name: 'Escrevendo o roteiro...' });
    expect(pending).toBeDisabled();
    await user.click(pending);
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it('Dado erro ao gerar vídeo, quando retorna à revisão, então preserva edições e permite nova tentativa', async () => {
    api.post
      .mockResolvedValueOnce({ data: { scenes } })
      .mockRejectedValueOnce({ response: { data: { error: { message: 'Não foi possível iniciar o vídeo' } } } });
    const user = await video();
    fireEvent.change(screen.getByLabelText('Sobre o que é o vídeo'), { target: { value: prompt } });
    await user.click(screen.getByRole('button', { name: 'Gerar roteiro', exact: true }));
    fireEvent.change(await screen.findByLabelText('O que aparece'), { target: { value: 'Cena preservada' } });
    await user.click(screen.getByRole('button', { name: 'Gerar vídeo', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível iniciar o vídeo');
    expect(screen.getByLabelText('O que aparece')).toHaveValue('Cena preservada');
    expect(screen.getByRole('button', { name: 'Gerar vídeo', exact: true })).toBeEnabled();
  });
  it('Dado falha ao aprimorar imagem, quando gera, então conserva o pedido e as opções selecionadas', async () => {
    api.post.mockRejectedValueOnce(new Error('offline'));
    setup();
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText('Descreva o anúncio'), { target: { value: prompt } });
    await user.click(screen.getByRole('button', { name: 'Vertical', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Gerar imagem', exact: true }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/studio/ai/generate-image',
        expect.objectContaining({ prompt, aspect_ratio: '9:16' }),
      ),
    );
  });
});
