import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UserPager } from './UserPager';

describe('UserPager', () => {
  it('não aparece com 9 ou menos', () => {
    const { container } = render(<UserPager total={9} page={1} perPage={9} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o intervalo e trava os extremos', () => {
    const { rerender } = render(<UserPager total={20} page={1} perPage={9} onChange={vi.fn()} />);
    expect(screen.getByText('Mostrando 1–9 de 20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');

    rerender(<UserPager total={20} page={3} perPage={9} onChange={vi.fn()} />);
    expect(screen.getByText('Mostrando 19–20 de 20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
  });

  it('clicar no número ou nas setas troca de página', async () => {
    const onChange = vi.fn();
    render(<UserPager total={20} page={2} perPage={9} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onChange.mock.calls).toEqual([[3], [1], [3]]);
  });
});
