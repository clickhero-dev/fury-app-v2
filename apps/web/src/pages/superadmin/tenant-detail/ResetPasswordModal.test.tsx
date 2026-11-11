import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PASSWORD_CHECKS, ResetPasswordModal } from './ResetPasswordModal';

function setup(props: Partial<Parameters<typeof ResetPasswordModal>[0]> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(<ResetPasswordModal userName="Ana" saving={false} error="" onSubmit={onSubmit} onClose={onClose} {...props} />);
  return { onSubmit, onClose, submit: () => screen.getByRole('button', { name: /Trocar senha/ }) };
}

describe('ResetPasswordModal', () => {
  it('regras iguais à política da API', () => {
    const strong = 'Abcdef1!';
    expect(PASSWORD_CHECKS.every((c) => c.test(strong))).toBe(true);
    ['abcdef1!', 'ABCDEF1!', 'Abcdefg!', 'Abcdefg1', 'Ab1!'].forEach((weak) => {
      expect(PASSWORD_CHECKS.every((c) => c.test(weak))).toBe(false);
    });
  });

  it('só libera com senha forte e confirmação igual', async () => {
    const { onSubmit, submit } = setup();
    expect(submit()).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Nova senha'), 'fraca');
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'fraca');
    expect(submit()).toBeDisabled();

    await userEvent.clear(screen.getByLabelText('Nova senha'));
    await userEvent.type(screen.getByLabelText('Nova senha'), 'NovaSenha#1');
    expect(screen.getByText('As senhas não conferem.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Confirmar senha'));
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'NovaSenha#1');
    expect(submit()).toBeEnabled();
    await userEvent.click(submit());
    expect(onSubmit).toHaveBeenCalledWith('NovaSenha#1');
  });

  it('mostrar e esconder a senha', async () => {
    setup();
    const input = screen.getByLabelText('Nova senha');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(input).toHaveAttribute('type', 'text');
  });

  it('Esc fecha, mas não enquanto salva', async () => {
    const first = setup();
    await userEvent.keyboard('{Escape}');
    expect(first.onClose).toHaveBeenCalledTimes(1);
  });

  it('não fecha com Esc durante o envio', async () => {
    const { onClose } = setup({ saving: true });
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('mostra o erro da API', () => {
    setup({ error: 'Não foi possível trocar a senha. Tente novamente.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível trocar a senha');
  });
});
