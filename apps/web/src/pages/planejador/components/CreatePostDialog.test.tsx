import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreatePostDialog } from './CreatePostDialog';

/**
 * Regressão: colisão de cache do react-query na chave `['studio/assets']`.
 * O EstudioHome cacheia o CORPO COMPLETO da resposta (`{ assets, total, ... }`);
 * o CreatePostDialog lia `response.data.assets` como se fosse o array. Com o
 * cache do EstudioHome quente, `studioAssetsData` virava o objeto → `.filter is
 * not a function`. O diálogo precisa ler `data.assets`.
 */

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());
const mockApiPatch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: {
    get: mockApiGet,
    post: mockApiPost,
    patch: mockApiPatch,
    defaults: { baseURL: 'https://api.ady.example.com' },
  },
}));

const FULL_BODY = {
  assets: [
    { id: 'a1', type: 'image', url: 'https://cdn.example.com/a.png', complianceStatus: 'approved' },
  ],
  total: 1,
  page: 1,
  totalPages: 1,
  creativesRemaining: 5,
  creativesLimit: 10,
};

function renderDialog(queryClient?: QueryClient) {
  const qc = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CreatePostDialog mode="now" onClose={() => {}} onCreated={() => {}} />
    </QueryClientProvider>,
  );
}

describe('CreatePostDialog — resposta de /studio/assets', () => {
  it('não quebra quando o cache [studio/assets] contém o corpo completo (populado pelo EstudioHome)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    // Simula o cache quente do EstudioHome: mesma chave, corpo completo.
    qc.setQueryData(['studio/assets'], FULL_BODY);

    renderDialog(qc);

    const libraryBtn = await screen.findByRole('button', { name: /Biblioteca do Estúdio/i });
    libraryBtn.click();

    // A imagem aprovada aparece — prova que leu `data.assets`, sem "filter is not a function".
    expect(await screen.findByAltText('Asset do Estúdio')).toBeTruthy();
  });

  it('mostra estado vazio quando o corpo completo não tem imagem aprovada', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    qc.setQueryData(['studio/assets'], {
      assets: [{ id: 'c1', type: 'copy', url: null, complianceStatus: 'approved' }],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    renderDialog(qc);

    const libraryBtn = await screen.findByRole('button', { name: /Biblioteca do Estúdio/i });
    libraryBtn.click();

    expect(await screen.findByText(/Nenhuma imagem na biblioteca/i)).toBeTruthy();
  });
});

describe('CreatePostDialog — seleção de mídia', () => {
  const THREE_ASSETS = {
    ...FULL_BODY,
    assets: ['a1', 'a2', 'a3'].map((id) => ({ id, type: 'image', url: `https://cdn.example.com/${id}.png`, name: id })),
  };

  async function openLibrary() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    qc.setQueryData(['studio/assets'], THREE_ASSETS);
    qc.setQueryData(['studio/assets', 'video'], { ...FULL_BODY, assets: [] });
    renderDialog(qc);
    (await screen.findByRole('button', { name: /Biblioteca do Estúdio/i })).click();
    return screen.findAllByAltText('a1').then(() => ['a1', 'a2', 'a3'].map((id) => screen.getByAltText(id).closest('button')!));
  }

  it('carrossel: seleciona várias imagens da biblioteca', async () => {
    const [b1, b2] = await openLibrary();
    fireEvent.click(screen.getByRole('button', { name: /Carrossel/i }));
    fireEvent.click(b1);
    fireEvent.click(b2);
    expect(await screen.findByText(/2\/10 selecionadas/i)).toBeTruthy();
  });

  it('post único: a 2ª seleção substitui a 1ª', async () => {
    const [b1, b2] = await openLibrary();
    fireEvent.click(b1);
    fireEvent.click(b2);
    expect(await screen.findByText(/Selecionado: a2/i)).toBeTruthy();
  });

  it('carrossel: recusa misturar imagem e vídeo no upload', async () => {
    const onError = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['studio/assets'], FULL_BODY);
    const { container } = render(
      <QueryClientProvider client={qc}>
        <CreatePostDialog mode="now" onClose={() => {}} onCreated={() => {}} onError={onError} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Carrossel/i }));
    const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    const img = new File(['a'], 'a.png', { type: 'image/png' });
    const vid = new File(['b'], 'b.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [img, vid] } });

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/só imagens ou só vídeos/));
    expect(await screen.findByText(/Adicionar mídia \(1\/10\)/)).toBeTruthy();
  });

  it('reels: biblioteca mostra só vídeos', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    qc.setQueryData(['studio/assets'], THREE_ASSETS);
    qc.setQueryData(['studio/assets', 'video'], {
      ...FULL_BODY,
      assets: [{ id: 'v1', type: 'video', url: 'https://cdn.example.com/v1.mp4', name: 'v1' }],
    });
    renderDialog(qc);
    fireEvent.click(screen.getByRole('button', { name: /Reels/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Biblioteca do Estúdio/i }));

    expect(await screen.findByLabelText('v1')).toBeTruthy();
    expect(screen.queryByAltText('a1')).toBeNull();
  });

  it('reels: upload recusa imagem', async () => {
    const onError = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['studio/assets'], FULL_BODY);
    const { container } = render(
      <QueryClientProvider client={qc}>
        <CreatePostDialog mode="now" onClose={() => {}} onCreated={() => {}} onError={onError} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Reels/i }));
    const input = container.querySelector('input[type="file"]:not([multiple])') as HTMLInputElement;
    expect(input.accept).toBe('video/mp4,video/quicktime');
    fireEvent.change(input, { target: { files: [new File(['a'], 'a.png', { type: 'image/png' })] } });

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Reels aceita só vídeo/));
  });

  it('prévia no formato real: post 1:1, stories 9:16 com fundo desfocado', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    qc.setQueryData(['studio/assets'], THREE_ASSETS);
    qc.setQueryData(['studio/assets', 'video'], { ...FULL_BODY, assets: [] });
    renderDialog(qc);
    fireEvent.click(await screen.findByRole('button', { name: /Biblioteca do Estúdio/i }));
    fireEvent.click((await screen.findByAltText('a1')).closest('button')!);

    const postFrame = screen.getByAltText('Preview').closest('div')!;
    expect(postFrame.className).toContain('aspect-square');

    fireEvent.click(screen.getByRole('button', { name: /Stories/i }));
    await screen.findByText(/Selecionado: a1/i);
    const storyImgs = document.querySelectorAll('img[src="https://cdn.example.com/a1.png"]');
    const storyFrame = screen.getByAltText('Preview').closest('div')!;
    expect(storyFrame.className).toContain('aspect-[9/16]');
    // prévia (fundo + frente) + miniatura na grade
    expect(storyImgs.length).toBe(3);
  });
});


describe('CreatePostDialog — agendar', () => {
  function renderSchedule(props: { preselectedDate?: string; preselectedTime?: string } = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    qc.setQueryData(['studio/assets'], FULL_BODY);
    return render(
      <QueryClientProvider client={qc}>
        <CreatePostDialog mode="schedule" onClose={() => {}} onCreated={() => {}} {...props} />
      </QueryClientProvider>,
    );
  }

  it('dia clicado: data e hora já preenchidas', () => {
    const { container } = renderSchedule({ preselectedDate: '2099-03-10', preselectedTime: '14:30' });
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2099-03-10');
    expect((container.querySelector('input[type="time"]') as HTMLInputElement).value).toBe('14:30');
  });

  it('sem hora: botão "Criar post" desabilitado', async () => {
    const { container } = renderSchedule({ preselectedDate: '2099-03-10' });
    fireEvent.click(await screen.findByRole('button', { name: /Biblioteca do Estúdio/i }));
    fireEvent.click((await screen.findByAltText('Asset do Estúdio')).closest('button')!);
    fireEvent.change(container.querySelector('textarea')!, { target: { value: 'legenda' } });

    const submit = screen.getByRole('button', { name: /Criar post/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(container.querySelector('input[type="time"]')!, { target: { value: '09:00' } });
    expect(submit.disabled).toBe(false);
  });

  it('horário no passado: avisa e bloqueia', () => {
    renderSchedule({ preselectedDate: '2000-01-01', preselectedTime: '09:00' });
    expect(screen.getByText(/Escolha um horário no futuro/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Criar post/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('CreatePostDialog — editar', () => {
  // 17:30Z = 14:30 em Brasília; o teste usa o fuso local do runner
  const at = new Date('2099-03-10T17:30:00.000Z');
  const pad = (n: number) => String(n).padStart(2, '0');
  const POST = {
    id: 'p1', planId: '', platform: 'instagram', postType: 'image', caption: 'legenda antiga',
    imageUrl: 'https://cdn.example.com/atual.png', dayIndex: 10, date: '2099-03-10', status: 'approved',
    scheduledAt: at.toISOString(),
  };

  function renderEdit(post: Record<string, unknown> = POST) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    qc.setQueryData(['studio/assets'], FULL_BODY);
    const onCreated = vi.fn();
    const utils = render(
      <QueryClientProvider client={qc}>
        <CreatePostDialog mode="schedule" editPost={post as any} onClose={() => {}} onCreated={onCreated} />
      </QueryClientProvider>,
    );
    return { ...utils, onCreated };
  }

  it('abre preenchido: legenda, data/hora local e mídia atual', () => {
    const { container } = renderEdit();
    expect(screen.getByText('Editar post')).toBeTruthy();
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('legenda antiga');
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value)
      .toBe(`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`);
    expect((container.querySelector('input[type="time"]') as HTMLInputElement).value)
      .toBe(`${pad(at.getHours())}:${pad(at.getMinutes())}`);
    expect(screen.getByAltText('Preview').getAttribute('src')).toBe('https://cdn.example.com/atual.png');
  });

  it('salvar: PATCH com tipo, mídia atual e horário', async () => {
    mockApiPatch.mockResolvedValue({ data: { data: {} } });
    const { container, onCreated } = renderEdit();
    fireEvent.change(container.querySelector('textarea')!, { target: { value: 'nova' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('Post atualizado!'));
    expect(mockApiPatch).toHaveBeenCalledWith('/planner/posts/p1', {
      caption: 'nova', postType: 'image', imageUrl: 'https://cdn.example.com/atual.png', imageUrls: [],
      scheduledAt: at.toISOString(),
    });
  });

  it('sem data e hora: salva como rascunho (scheduledAt null)', async () => {
    mockApiPatch.mockResolvedValue({ data: { data: {} } });
    const { onCreated } = renderEdit({ ...POST, scheduledAt: undefined, status: 'draft' });
    expect(screen.getByText(/fica como rascunho/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockApiPatch.mock.calls.at(-1)![1]).toMatchObject({ scheduledAt: null });
  });

  it('trocar para Reels descarta imagem atual e exige vídeo', () => {
    renderEdit();
    fireEvent.click(screen.getByRole('button', { name: /Reels/i }));
    expect(screen.queryByRole('button', { name: /Trocar mídia/i })).toBeNull();
    expect((screen.getByRole('button', { name: /^Salvar$/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

