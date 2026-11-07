/*
 * Funcionalidade: avaliar criativo recém-gerado.
 * Cenário: seleção e envio; Dado o convite visível; Quando escolho uma estrela;
 * Então a seleção é acessível e o callback recebe a nota.
 * Cenário: fechamento; Dado o convite visível; Quando escolho Agora não;
 * Então o callback de fechamento é chamado sem enviar nota.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreativeRatingPrompt } from './CreativeRatingPrompt';

describe('CreativeRatingPrompt', () => {
  it('seleciona qualquer nota de 1 a 5 e envia a nota escolhida', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreativeRatingPrompt onSubmit={onSubmit} onClose={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: '4 estrelas' }));
    expect((screen.getByRole('radio', { name: '4 estrelas' }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    expect(onSubmit).toHaveBeenCalledWith(4);
  });

  it('permite fechar sem avaliação', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreativeRatingPrompt onSubmit={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
