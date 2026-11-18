// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrialPasswordModal } from './TrialPasswordModal';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { post } }));

describe('TrialPasswordModal', () => {
  beforeEach(() => { post.mockReset().mockResolvedValue({ data: { success: true } }); });

  it('mostra os requisitos e impede o envio de senha fraca', () => {
    render(<TrialPasswordModal onComplete={vi.fn()} />);
    expect(screen.getByText(/8 a 255 caracteres/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'abcdefg' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'abcdefg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(post).not.toHaveBeenCalled();
  });

  it('informa confirmação diferente e salva somente quando as senhas são válidas e iguais', async () => {
    const onComplete = vi.fn();
    render(<TrialPasswordModal onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'NovaSenha1!' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'OutraSenha1!' } });
    expect(screen.getByText(/senhas não coincidem/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'NovaSenha1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/set-password', { newPassword: 'NovaSenha1!' }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('valida os limites e permite mostrar e ocultar as senhas', () => {
    render(<TrialPasswordModal onComplete={vi.fn()} />);
    const password = screen.getByLabelText('Nova senha');
    const confirmation = screen.getByLabelText('Confirmar senha');
    const save = screen.getByRole('button', { name: 'Salvar senha' });
    fireEvent.change(password, { target: { value: 'Aa1!aaa' } });
    fireEvent.change(confirmation, { target: { value: 'Aa1!aaa' } });
    expect(save).toBeDisabled();
    const tooLong = 'Aa1!' + 'a'.repeat(252);
    fireEvent.change(password, { target: { value: tooLong } });
    fireEvent.change(confirmation, { target: { value: tooLong } });
    expect(save).toBeDisabled();
    const maximum = 'Aa1!' + 'a'.repeat(251);
    fireEvent.change(password, { target: { value: maximum } });
    fireEvent.change(confirmation, { target: { value: maximum } });
    expect(save).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senhas' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(confirmation).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senhas' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('mostra erro e permite tentar novamente quando o servidor falha', async () => {
    post.mockRejectedValueOnce(new Error('indisponível'));
    const onComplete = vi.fn();
    render(<TrialPasswordModal onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'NovaSenha1!' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'NovaSenha1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar');
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
  });
});
