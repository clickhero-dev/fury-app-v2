import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BusinessContextImprover } from './BusinessContextImprover';

/**
 * Funcionalidade: melhorar contexto do negócio na tela
 * Cenário: sugestão progressiva
 * Dado texto original, Quando aciono melhorar, Então vejo a sugestão e posso usá-la sem salvar automaticamente.
 * Cenário: falha
 * Dado erro durante o stream, Quando a geração termina, Então o original permanece visível e recebo feedback.
 */
describe('BusinessContextImprover', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mostra sugestão progressiva e só altera o campo ao usar', async () => {
    const onChange = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: fragment\ndata: {"text":"Melhor "}\n\n'));
        controller.enqueue(new TextEncoder().encode('event: fragment\ndata: {"text":"texto"}\n\n'));
        controller.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body }));
    render(<BusinessContextImprover value="Original" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /melhorar contexto/i }));
    expect(await screen.findByText('Melhor texto')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /usar sugestão/i }));
    expect(onChange).toHaveBeenCalledWith('Melhor texto');
  });

  it('mantém o original e informa erro quando o stream falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    render(<BusinessContextImprover value="Original" onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /melhorar contexto/i }));
    expect(await screen.findByText(/não foi possível melhorar/i)).toBeTruthy();
    expect(screen.queryByText('Original')).toBeNull();
  });

  it('não permite usar sugestão desatualizada depois que o texto original muda', async () => {
    const onChange = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: fragment\ndata: {"text":"Sugestão"}\n\n'));
        controller.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body }));
    const { rerender } = render(<BusinessContextImprover value="Original" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /melhorar contexto/i }));
    expect(await screen.findByText('Sugestão')).toBeTruthy();
    rerender(<BusinessContextImprover value="Texto editado" onChange={onChange} />);

    const useButton = screen.getByRole('button', { name: /usar sugestão/i });
    expect(useButton).toBeDisabled();
    expect(screen.getByText(/texto original mudou/i)).toBeTruthy();
    await userEvent.click(useButton);
    expect(onChange).not.toHaveBeenCalled();
  });
});
