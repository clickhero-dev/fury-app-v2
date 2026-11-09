import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessagingDestinationCard } from './MessagingDestinationCard';

describe('MessagingDestinationCard', () => {
  it('Cenário: card inteiro seleciona e desseleciona o destino pelo mouse e teclado', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <MessagingDestinationCard
        destination="instagram_direct"
        name="Instagram"
        description="As pessoas vão te chamar pelo Instagram"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );

    const card = screen.getByTestId('message-destination-instagram_direct');
    const checkbox = screen.getByRole('checkbox', { name: /instagram/i });
    expect(checkbox).not.toBeChecked();
    expect(card).toHaveAttribute('data-state', 'unchecked');
    expect(card.className).toMatch(/min-h-/);

    await user.click(card);
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);

    rerender(
      <MessagingDestinationCard
        destination="instagram_direct"
        name="Instagram"
        description="As pessoas vão te chamar pelo Instagram"
        checked
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(checkbox).toBeChecked();
    expect(card).toHaveAttribute('data-state', 'checked');
    expect(screen.getByText('Selecionado')).toBeVisible();

    checkbox.focus();
    await user.keyboard(' ');
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it('Cenário: Facebook tem logo, descrição e estrutura responsiva', () => {
    render(
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MessagingDestinationCard
          destination="messenger"
          name="Facebook"
          description="As pessoas vão te chamar pelo Facebook"
          checked={false}
          onCheckedChange={vi.fn()}
        />
      </div>,
    );

    expect(screen.getByRole('checkbox', { name: /facebook/i })).toBeInTheDocument();
    expect(screen.getByTestId('facebook-logo')).toBeVisible();
    expect(screen.getByText('As pessoas vão te chamar pelo Facebook')).toBeVisible();
    expect(screen.getByTestId('message-destination-messenger').parentElement?.className).toMatch(/sm:grid-cols-2/);
  });
});
