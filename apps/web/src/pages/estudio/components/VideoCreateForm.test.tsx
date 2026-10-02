import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VideoCreateForm } from './VideoCreateForm';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { defaults: { baseURL: 'http://localhost/api' }, get: mockApiGet, post: mockApiPost },
}));

const OPTIONS = {
  voices: [
    { id: 'pt-BR-AntonioNeural-Male', key: 'antonio', name: 'Antonio', gender: 'Masculina' },
    { id: 'pt-BR-FranciscaNeural-Female', key: 'francisca', name: 'Francisca', gender: 'Feminina' },
  ],
  transitions: [{ id: 'none', label: 'Sem transição' }, { id: 'Shuffle', label: 'Aleatória' }],
  builtinSongs: [{ file: 'output000.mp3', label: 'Música 01', previewPath: '/studio/video/music/builtin/output000.mp3' }],
  userTracks: [],
};

function renderForm(onCreated = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <VideoCreateForm onCreated={onCreated} />
    </QueryClientProvider>,
  );
  return onCreated;
}

describe('VideoCreateForm', () => {
  beforeEach(() => {
    mockApiGet.mockReset().mockResolvedValue({ data: OPTIONS });
    mockApiPost.mockReset().mockResolvedValue({ data: { jobId: 'job-1' } });
  });

  it('só libera "Gerar vídeo" com tema de 10+ caracteres', async () => {
    renderForm();
    const button = screen.getByRole('button', { name: /gerar vídeo/i });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/tema do vídeo/i), 'Pizzaria artesanal');
    expect(button).toBeEnabled();
  });

  it('predefinida exige escolher uma música antes de gerar', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText(/tema do vídeo/i), 'Pizzaria artesanal');
    await userEvent.click(screen.getByRole('button', { name: 'Predefinida' }));
    expect(screen.getByRole('button', { name: /gerar vídeo/i })).toBeDisabled();
    await userEvent.click(await screen.findByRole('button', { name: 'Música 01' }));
    expect(screen.getByRole('button', { name: /gerar vídeo/i })).toBeEnabled();
  });

  it('envia o payload escolhido e devolve o jobId', async () => {
    const onCreated = renderForm();
    await userEvent.type(screen.getByLabelText(/tema do vídeo/i), 'Pizzaria artesanal');
    await userEvent.click(await screen.findByRole('button', { name: /francisca/i, pressed: false }));
    await userEvent.click(screen.getByRole('button', { name: 'Sem música' }));
    await userEvent.click(screen.getByRole('button', { name: 'Em cima' }));
    await userEvent.click(screen.getByRole('button', { name: /gerar vídeo/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('job-1'));
    expect(mockApiPost).toHaveBeenCalledWith('/studio/video/jobs', {
      prompt: 'Pizzaria artesanal',
      voice: 'pt-BR-FranciscaNeural-Female',
      voiceRate: 1,
      music: { mode: 'none', file: undefined, trackId: undefined, volume: 0.2 },
      subtitles: { enabled: true, position: 'top' },
      transition: 'Shuffle',
    });
  });
});
