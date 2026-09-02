import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Step2Creative } from './Step2Creative';
import type { WizardCreativeState, WizardObjective } from '../types';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());
const onCreativesChange = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet, post: mockApiPost },
}));

function makeCreative(overrides: Partial<WizardCreativeState> = {}): WizardCreativeState {
  return { id: crypto.randomUUID(), headline: '', primaryText: '', ...overrides };
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Harness controlado — o clique em "Adicionar outro criativo" realmente re-renderiza o Step2. */
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
  mockApiGet.mockResolvedValue({ data: { assets: [] } });
});

describe('Step2Creative — múltiplos criativos', () => {
  it('renderiza um card inicial com os campos de criativo', async () => {
    render(<Harness initial={[makeCreative()]} />);
    await screen.findAllByText('Nenhuma imagem encontrada na galeria.');

    expect(screen.getByText('Criativo 1')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: Promoção imperdível este mês!')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Descreva sua oferta de forma clara e atrativa.')).toBeInTheDocument();
    // com apenas 1 card, o botão de remover fica desabilitado
    expect(screen.getByRole('button', { name: 'Remover criativo 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Adicionar outro criativo/ })).not.toBeDisabled();
  });

  it('adiciona um segundo card ao clicar em "Adicionar outro criativo"', async () => {
    render(<Harness initial={[makeCreative()]} />);
    await screen.findAllByText('Nenhuma imagem encontrada na galeria.');

    fireEvent.click(screen.getByRole('button', { name: /Adicionar outro criativo/ }));

    expect(screen.getByText('Criativo 2')).toBeInTheDocument();
    expect(onCreativesChange).toHaveBeenCalledTimes(1);
    const next = onCreativesChange.mock.calls[0][0] as WizardCreativeState[];
    expect(next).toHaveLength(2);
    expect(next[1].id).toBeTruthy();
    expect(next[0].id).toBeTruthy();
  });

  it('no cap de 4 criativos o botão de adicionar fica desabilitado', async () => {
    const initial = Array.from({ length: 4 }, (_, i) => makeCreative({ id: `c${i}` }));
    render(<Harness initial={initial} />);
    await screen.findAllByText('Nenhuma imagem encontrada na galeria.');

    expect(screen.getByText('Criativo 4')).toBeInTheDocument();
    const addButton = screen.getByRole('button', { name: /Adicionar outro criativo/ });
    expect(addButton).toBeDisabled();

    fireEvent.click(addButton);
    expect(onCreativesChange).not.toHaveBeenCalled();
  });

  it('remove um card ao clicar no X', async () => {
    render(
      <Harness
        initial={[
          makeCreative({ id: 'a', headline: 'Primeiro' }),
          makeCreative({ id: 'b', headline: 'Segundo' }),
        ]}
      />
    );
    await screen.findAllByText('Nenhuma imagem encontrada na galeria.');

    fireEvent.click(screen.getByRole('button', { name: 'Remover criativo 2' }));

    const next = onCreativesChange.mock.calls[0][0] as WizardCreativeState[];
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('a');
    expect(screen.queryByText('Criativo 2')).not.toBeInTheDocument();
  });

  it('chama onChange com o array atualizado ao editar a headline', async () => {
    render(
      <Harness
        initial={[makeCreative({ id: 'a' }), makeCreative({ id: 'b', headline: 'Outro' })]}
      />
    );
    await screen.findAllByText('Nenhuma imagem encontrada na galeria.');

    const headlineInputs = screen.getAllByPlaceholderText('Ex: Promoção imperdível este mês!');
    expect(headlineInputs).toHaveLength(2);
    fireEvent.change(headlineInputs[0], { target: { value: 'Nova headline' } });

    const next = onCreativesChange.mock.calls[0][0] as WizardCreativeState[];
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe('a');
    expect(next[0].headline).toBe('Nova headline');
    expect(next[1].headline).toBe('Outro');
  });
});