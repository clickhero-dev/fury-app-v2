import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Step2Creative } from './Step2Creative';
import type { WizardCreativeState, WizardObjective } from '../types';
import type { StudioAsset } from '@/types/studio';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());
const onCreativesChange = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet, post: mockApiPost },
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
  mockApiGet.mockResolvedValue({ data: { assets: [makeAsset('a1', 'Banner A'), makeAsset('a2', 'Banner B')] } });
});

describe('Step2Creative — seleção múltipla de imagens', () => {
  it('renderiza os campos de texto UMA única vez (headline, texto e contador)', async () => {
    render(<Harness initial={[makeCreative()]} />);

    expect(await screen.findByRole('button', { name: /Banner A/ })).toBeInTheDocument();
    // um único input de headline e uma única textarea (texto compartilhado entre os criativos)
    expect(screen.getAllByPlaceholderText('Ex: Promoção imperdível este mês!')).toHaveLength(1);
    expect(screen.getAllByPlaceholderText('Descreva sua oferta de forma clara e atrativa.')).toHaveLength(1);
    // não existe mais o card "Criativo 1"
    expect(screen.queryByText('Criativo 1')).not.toBeInTheDocument();
  });

  it('seleciona uma imagem da galeria (vira 1 criativo) e o contador atualiza', async () => {
    render(<Harness initial={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: /Banner A/ }));

    expect(onCreativesChange).toHaveBeenCalledTimes(1);
    const next = onCreativesChange.mock.calls[0][0] as WizardCreativeState[];
    expect(next).toHaveLength(1);
    expect(next[0].assetId).toBe('a1');
    expect(next[0].id).toBeTruthy();
  });

  it('clica de novo na mesma imagem e desmarca (remove o criativo)', async () => {
    render(<Harness initial={[makeCreative({ id: 'c1', assetId: 'a1', assetUrl: 'https://cdn.example.com/a1.jpg' })]} />);

    fireEvent.click(await screen.findByRole('button', { name: /Banner A/ }));

    const next = onCreativesChange.mock.calls[0][0] as WizardCreativeState[];
    expect(next).toHaveLength(0);
  });

  it('seleciona 2 imagens e o texto digitado é aplicado a TODOS os criativos', async () => {
    render(<Harness initial={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: /Banner A/ }));
    fireEvent.click(screen.getByRole('button', { name: /Banner B/ }));
    expect(onCreativesChange).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByPlaceholderText('Ex: Promoção imperdível este mês!'), {
      target: { value: 'Oferta única' },
    });

    const next = onCreativesChange.mock.calls[2][0] as WizardCreativeState[];
    expect(next).toHaveLength(2);
    expect(next.every((c) => c.headline === 'Oferta única')).toBe(true);
  });

  it('no cap de 4, clicar numa 5ª imagem não adiciona e mostra o aviso', async () => {
    const initial = Array.from({ length: 4 }, (_, i) =>
      makeCreative({ id: `c${i}`, assetId: `sel${i}`, assetUrl: `https://cdn.example.com/sel${i}.jpg` })
    );
    render(<Harness initial={initial} />);

    fireEvent.click(await screen.findByRole('button', { name: /Banner A/ }));

    expect(onCreativesChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Máximo de 4 criativos atingido/)).toBeInTheDocument();
  });

  it('mostra o contador de criativos selecionados via role="status"', async () => {
    render(<Harness initial={[makeCreative({ id: 'c1', assetId: 'a1', assetUrl: 'https://cdn.example.com/a1.jpg' })]} />);
    await screen.findByRole('button', { name: /Banner B/ });

    const statuses = screen.getAllByRole('status');
    expect(statuses.some((el) => el.textContent?.includes('1/4 selecionadas'))).toBe(true);
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
    await screen.findByRole('button', { name: /Banner A/ });

    const removeButtons = screen.getAllByRole('button', { name: 'Remover criativo' });
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[0]);

    const next = onCreativesChange.mock.calls[0][0] as WizardCreativeState[];
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('c2');
  });
});