import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreateUserModal, type NewUser } from './CreateUserModal';

const blank: NewUser = { name: '', email: '', password: '', role: 'member' };

function Harness(props: { isSuperAdmin?: boolean; error?: string; onSubmit?: () => void; onClose?: () => void; open?: boolean }) {
  const [value, setValue] = useState(blank);
  return (
    <CreateUserModal
      open={props.open ?? true}
      value={value}
      onChange={setValue}
      onSubmit={props.onSubmit ?? vi.fn()}
      onClose={props.onClose ?? vi.fn()}
      saving={false}
      error={props.error ?? ''}
      isSuperAdmin={props.isSuperAdmin ?? false}
    />
  );
}

describe('CreateUserModal', () => {
  it('fechado não renderiza nada', () => {
    render(<Harness open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tem Nome, Email e Senha com os mesmos placeholders e sem Cargo para parceiro', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Nome')).toHaveAttribute('placeholder', 'Nome');
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
    expect(screen.queryByLabelText('Cargo')).not.toBeInTheDocument();
  });

  it('superadmin escolhe o cargo', () => {
    render(<Harness isSuperAdmin />);
    expect(screen.getByRole('option', { name: 'Usuário Titular' })).toBeInTheDocument();
  });

  it('Enter envia e Esc fecha', async () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<Harness onSubmit={onSubmit} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Nome'), 'Ana{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('mostra o erro dentro do modal', () => {
    render(<Harness error="Erro ao criar usuário" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Erro ao criar usuário');
  });
});
