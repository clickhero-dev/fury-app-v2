import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreatePostDialog } from './CreatePostDialog';
const post = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { assets: [] } }), post, patch: vi.fn(), defaults: { baseURL: 'https://api.example.com/api' } } }));
function setup(kind = 'image', caption = '') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(['studio/assets'], { assets: [] });
  const onClose = vi.fn();
  const utils = render(<QueryClientProvider client={qc}><CreatePostDialog mode="now" editPost={{ id: 'p1', postType: kind, caption, imageUrl: `https://media.example.com/a.${kind === 'reel' ? 'mp4' : 'png'}` } as any} onClose={onClose} onCreated={vi.fn()} /></QueryClientProvider>);
  return { ...utils, onClose };
}
describe('BDD: legenda automática', () => {
  beforeEach(() => { vi.resetAllMocks(); URL.createObjectURL = vi.fn(() => 'blob:preview'); });
  it('Cenário: imagem em edição → envia mídia e preenche legenda editável sem salvar', async () => {
    post.mockResolvedValue({ data: { data: { caption: 'Nova legenda', imageUsed: true } } });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar legenda automática' }));
    await screen.findByDisplayValue('Nova legenda');
    expect(post).toHaveBeenCalledWith('/planner/posts/suggest-caption', { imageUrl: 'https://media.example.com/a.png' });
    expect(post).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false);
  });
  it('Cenário: vídeo sem tema → botão habilitado e envia videoUrl para ouvir a fala', async () => {
    post.mockResolvedValue({ data: { data: { caption: 'Pela fala', imageUsed: false } } });
    setup('reel');
    const button = screen.getByRole('button', { name: 'Gerar legenda automática' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false); fireEvent.click(button);
    await screen.findByDisplayValue('Pela fala');
    expect(post).toHaveBeenCalledWith('/planner/posts/suggest-caption', { videoUrl: 'https://media.example.com/a.mp4' });
  });
  it('Cenário: falha de transcrição → mensagem específica segura e mantém texto', async () => {
    post.mockRejectedValue({ response: { data: { error: { code: 'CAPTION_VIDEO_NO_SPEECH', message: 'raw secret' } } } });
    setup('reel', 'Meu tema'); fireEvent.click(screen.getByRole('button', { name: 'Gerar legenda automática' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi identificada fala no vídeo');
    expect(screen.getByDisplayValue('Meu tema')).toBeTruthy();
    expect(screen.queryByText('raw secret')).toBeNull();
  });
  it('Cenário: fechar durante geração → descarta resposta tardia', async () => {
    let resolve!: (value: any) => void;
    post.mockReturnValue(new Promise(r => { resolve = r; }));
    const { onClose } = setup('image', 'original');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar legenda automática' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' })); expect(onClose).toHaveBeenCalled();
    resolve({ data: { data: { caption: 'obsoleta', imageUsed: true } } });
    await waitFor(() => expect(screen.queryByDisplayValue('obsoleta')).toBeNull());
    expect(screen.getByDisplayValue('original')).toBeTruthy();
  });
});

// Dado upload local, quando gerar/repetir/publicar, então o arquivo é enviado uma vez.
describe('BDD: upload e preservação do formulário', () => {
  beforeEach(() => { vi.resetAllMocks(); URL.createObjectURL = vi.fn(() => 'blob:preview'); });
  it('Cenário: upload → gerar duas vezes e publicar texto editado reutiliza URL', async () => {
    post.mockImplementation(async (url: string) => ({ data: { data: url.endsWith('/upload') ? { url: 'https://media.example.com/new.png' } : url.endsWith('/suggest-caption') ? { caption: 'Sugestão', imageUsed: true } : { status: 'published' } } }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); qc.setQueryData(['studio/assets'], { assets: [] });
    const onCreated = vi.fn();
    const { container } = render(<QueryClientProvider client={qc}><CreatePostDialog mode="now" onClose={vi.fn()} onCreated={onCreated} /></QueryClientProvider>);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['a'], 'a.png', { type: 'image/png' })] } });
    expect(screen.getByText(/ficará na biblioteca mesmo se cancelar/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar legenda automática' })); await screen.findByDisplayValue('Sugestão');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar legenda automática' }));
    await waitFor(() => expect(post.mock.calls.filter(c => c[0].endsWith('/suggest-caption'))).toHaveLength(2));
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Texto editado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Postar agora' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(post.mock.calls.filter(c => c[0].endsWith('/upload'))).toHaveLength(1);
    expect(post.mock.calls.find(c => c[0].endsWith('/publish-now'))?.[1]).toMatchObject({ caption: 'Texto editado', imageUrl: 'https://media.example.com/new.png' });
  });
  it('Cenário: troca de mídia durante geração → não aplica resposta antiga', async () => {
    let resolve!: (value: any) => void;
    post.mockReturnValue(new Promise(r => { resolve = r; }));
    setup('image', 'original');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar legenda automática' })); await waitFor(() => expect(post).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Trocar mídia' }));
    resolve({ data: { data: { caption: 'antiga', imageUsed: true } } });
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false));
    expect(screen.getByDisplayValue('original')).toBeTruthy();
  });
  it('Cenário: stories com imagem → imagem disponível para legenda', async () => {
    post.mockResolvedValue({ data: { data: { caption: 'Story', imageUsed: true } } });
    setup('stories'); fireEvent.click(screen.getByRole('button', { name: 'Gerar legenda automática' }));
    await screen.findByDisplayValue('Story');
    expect(post).toHaveBeenCalledWith('/planner/posts/suggest-caption', { imageUrl: 'https://media.example.com/a.png' });
  });
  it('Cenário: upload falha → texto preservado e nova tentativa habilitada', async () => {
    post.mockRejectedValue(new Error('secret'));
    const qc = new QueryClient(); qc.setQueryData(['studio/assets'], { assets: [] });
    const { container } = render(<QueryClientProvider client={qc}><CreatePostDialog mode="now" onClose={vi.fn()} onCreated={vi.fn()} /></QueryClientProvider>);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['a'], 'a.png', { type: 'image/png' })] } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'original' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar legenda automática' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível enviar a mídia');
    expect(screen.getByDisplayValue('original')).toBeTruthy(); expect(post).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Gerar legenda automática' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

it('Cenário: carrossel → geração envia apenas primeira mídia; envio final reutiliza upload', async () => {
  post.mockReset(); URL.createObjectURL = vi.fn(() => 'blob:preview');
  let uploads = 0;
  post.mockImplementation(async (url: string) => ({ data: { data: url.endsWith('/upload') ? { url: `https://media.example.com/${++uploads}.png` } : url.endsWith('/suggest-caption') ? { caption: 'Carrossel', imageUsed: true } : { status: 'published' } } }));
  const qc = new QueryClient(); qc.setQueryData(['studio/assets'], { assets: [] });
  const onCreated = vi.fn();
  const { container } = render(<QueryClientProvider client={qc}><CreatePostDialog mode="now" onClose={vi.fn()} onCreated={onCreated} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Carrossel' }));
  fireEvent.change(container.querySelector('input[multiple]')!, { target: { files: [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Gerar legenda automática' })); await screen.findByDisplayValue('Carrossel');
  expect(uploads).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Postar agora' }));
  await waitFor(() => expect(onCreated).toHaveBeenCalled());
  expect(uploads).toBe(2);
  expect(post.mock.calls.find(c => c[0].endsWith('/publish-now'))?.[1].imageUrls).toEqual(['https://media.example.com/1.png', 'https://media.example.com/2.png']);
});
