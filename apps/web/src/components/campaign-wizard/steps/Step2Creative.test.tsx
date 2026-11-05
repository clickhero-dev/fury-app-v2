import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Step2Creative } from './Step2Creative';
import type { WizardCreativeState, WizardObjective } from '../types';
import type { StudioAsset } from '@/types/studio';

/*
Funcionalidade: seleção livre de criativos

Cenário: selecionar cinco e dezesseis assets aprovados sem bloquear a galeria
  Dado que a galeria contém dezesseis assets aprovados
  Quando seleciono cinco e depois dezesseis assets
  Então todos permanecem selecionados e os contadores mostram a quantidade selecionada

Cenário: recomendação editorial não bloqueia a continuidade
  Dado que há menos de dezesseis criativos selecionados
  Quando a etapa de criativos é exibida
  Então a recomendação de usar ao menos dezesseis criativos fica visível sem impedir a seleção

Cenário: remover um criativo preserva os demais
  Dado que há criativos de fontes diferentes selecionados
  Quando removo uma miniatura
  Então somente o criativo alvo é removido
*/

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());
const onCreativesChange = vi.hoisted(() => vi.fn());
const mockUploadMutateAsync = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet, post: mockApiPost },
}));

vi.mock('../hooks/useCreateCampaign', () => ({
  useUploadCreative: () => ({ mutateAsync: mockUploadMutateAsync, isPending: false }),
}));

function makeCreative(overrides: Partial<WizardCreativeState> = {}): WizardCreativeState {
  return { id: crypto.randomUUID(), headline: '', primaryText: '', ...overrides };
}

function makeAsset(id: string, name: string): StudioAsset {
  return {
    id,
    type: 'image',
    url: `https://cdn.example.com/${id}.jpg`,
    name,
    headline: `Headline ${name}`,
    primaryText: `Texto ${name}`,
    description: '',
    title: '',
    complianceStatus: 'approved',
  } as StudioAsset;
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Harness controlado — as mudanças re-renderizam o Step2 com o array atualizado. */
function Harness({
  initial,
  objective = null,
}: {
  initial: WizardCreativeState[];
  objective?: WizardObjective | null;
}) {
  const [creatives, setCreatives] = useState<WizardCreativeState[]>(initial);
  const handleChange = (next: WizardCreativeState[]) => {
    onCreativesChange(next);
    setCreatives(next);
  };
  return (
    <QueryClientProvider client={makeQueryClient()}>
      <Step2Creative value={creatives} onChange={handleChange} objective={objective} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  onCreativesChange.mockClear();
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  mockUploadMutateAsync.mockReset();
  mockUploadMutateAsync.mockImplementation(async (file: File) => `https://cdn.example.com/${file.name}`);
  mockApiGet.mockResolvedValue({
    data: { assets: Array.from({ length: 16 }, (_, index) => makeAsset(`a${index + 1}`, `Banner ${index + 1}`)) },
  });
});

describe('Step2Creative — seleção múltipla de imagens', () => {
  it('renderiza os campos de texto UMA única vez (headline, texto e contador)', async () => {
    render(<Harness initial={[makeCreative()]} />);

    expect(await screen.findByRole('button', { name: 'Banner 1' })).toBeInTheDocument();
    // um único input de headline e uma única textarea (texto compartilhado entre os criativos)
    expect(screen.getAllByPlaceholderText('Ex: Promoção imperdível este mês!')).toHaveLength(1);
    expect(screen.getAllByPlaceholderText('Descreva sua oferta de forma clara e atrativa.')).toHaveLength(1);
    // não existe mais o card "Criativo 1"
    expect(screen.queryByText('Criativo 1')).not.toBeInTheDocument();
  });

  it('seleciona uma imagem da galeria (vira 1 criativo) e o contador atualiza', async () => {
    render(<Harness initial={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Banner 1' }));

    expect(onCreativesChange).toHaveBeenCalledTimes(1);
    const next = onCreativesChange.mock.calls[0][0] as WizardCreativeState[];
    expect(next).toHaveLength(1);
    expect(next[0].assetId).toBe('a1');
    expect(next[0].id).toBeTruthy();
  });

  it('clica de novo na mesma imagem e desmarca (remove o criativo)', async () => {
    render(<Harness initial={[makeCreative({ id: 'c1', assetId: 'a1', assetUrl: 'https://cdn.example.com/a1.jpg' })]} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Banner 1' }));

    const next = onCreativesChange.mock.calls[0][0] as WizardCreativeState[];
    expect(next).toHaveLength(0);
  });

  it('seleciona 2 imagens e o texto digitado é aplicado a TODOS os criativos', async () => {
    render(<Harness initial={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Banner 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Banner 2' }));
    expect(onCreativesChange).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByPlaceholderText('Ex: Promoção imperdível este mês!'), {
      target: { value: 'Oferta única' },
    });

    const next = onCreativesChange.mock.calls[2][0] as WizardCreativeState[];
    expect(next).toHaveLength(2);
    expect(next.every((c) => c.headline === 'Oferta única')).toBe(true);
  });

  it('seleciona cinco e depois dezesseis imagens sem bloquear a galeria', async () => {
    const initial = Array.from({ length: 4 }, (_, i) =>
      makeCreative({ id: `c${i}`, assetId: `sel${i}`, assetUrl: `https://cdn.example.com/sel${i}.jpg` })
    );
    render(<Harness initial={initial} />);

    for (let index = 1; index <= 16; index += 1) {
      fireEvent.click(await screen.findByRole('button', { name: `Banner ${index}` }));
    }

    expect(onCreativesChange.mock.calls[0][0]).toHaveLength(5);
    expect(onCreativesChange.mock.calls.at(-1)?.[0]).toHaveLength(20);
    expect(screen.getAllByRole('button', { name: 'Banner 16' })[0]).not.toBeDisabled();
  });

  it('mostra contadores dinâmicos com singular e plural via role="status"', async () => {
    render(<Harness initial={[makeCreative({ id: 'c1', assetId: 'a1', assetUrl: 'https://cdn.example.com/a1.jpg' })]} />);
    await screen.findByRole('button', { name: 'Banner 2' });

    const statuses = screen.getAllByRole('status');
    expect(statuses.some((el) => el.textContent?.includes('1 selecionada'))).toBe(true);
    expect(screen.getByText('Considere usar pelo menos 16 criativos para oferecer mais variações.')).toBeInTheDocument();
  });

  it('envia cinco PNG/JPG válidos sem truncar o lote', async () => {
    const { container } = render(<Harness initial={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fazer Upload' }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = Array.from({ length: 5 }, (_, index) => new File(['image'], `criativo-${index}.jpg`, { type: 'image/jpeg' }));

    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(onCreativesChange).toHaveBeenCalledTimes(1));
    expect(mockUploadMutateAsync).toHaveBeenCalledTimes(5);
    expect(onCreativesChange.mock.calls[0][0]).toHaveLength(5);
  });

  it('remove uma imagem selecionada pelo X da faixa "Selecionadas"', async () => {
    render(
      <Harness
        initial={[
          makeCreative({ id: 'c1', assetId: 'a1', assetUrl: 'https://cdn.example.com/a1.jpg' }),
          makeCreative({ id: 'c2', assetId: 'a2', assetUrl: 'https://cdn.example.com/a2.jpg' }),
        ]}
      />
    );
    await screen.findByRole('button', { name: 'Banner 1' });

    const removeButtons = screen.getAllByRole('button', { name: 'Remover criativo' });
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[0]);

    const next = onCreativesChange.mock.calls[0][0] as WizardCreativeState[];
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('c2');
  });
});
