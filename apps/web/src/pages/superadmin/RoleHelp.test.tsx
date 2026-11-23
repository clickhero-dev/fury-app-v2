import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RoleHelp } from './RoleHelp';

describe('RoleHelp', () => {
  it('ao passar o mouse explica cada cargo', async () => {
    render(<RoleHelp />);
    await userEvent.hover(screen.getByRole('button', { name: 'O que cada cargo faz' }));
    expect((await screen.findAllByText(/Dono da conta do cliente/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Membro da equipe do cliente/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/mesmo com o plano vencido/).length).toBeGreaterThan(0);
  });
});
