import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasswordInput } from './password-input';

// Funcionalidade: conferir valores protegidos sem alterar o formulário.
describe('PasswordInput', () => {
  it('Dado um formulário, quando alterno pelo teclado, então preserva o valor e não envia', async () => {
    const submit = vi.fn((event) => event.preventDefault());
    const change = vi.fn();
    render(<form onSubmit={submit}><PasswordInput aria-label="Senha" defaultValue="segredo" onChange={change} /></form>);
    const input = screen.getByLabelText('Senha');
    const toggle = screen.getByRole('button', { name: 'Mostrar senha' });
    expect(input).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-controls', input.id);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.tab();
    await userEvent.tab();
    expect(toggle).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(input).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAccessibleName('Ocultar senha');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard(' ');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('segredo');
    expect(change).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('Dados dois campos vazios, quando revelo um, então o outro permanece oculto e remontar oculta novamente', async () => {
    const { unmount } = render(<><PasswordInput aria-label="Nova" /><PasswordInput aria-label="Confirmação" /></>);
    await userEvent.click(screen.getAllByRole('button', { name: 'Mostrar senha' })[0]);
    expect(screen.getByLabelText('Nova')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Confirmação')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Nova')).toHaveValue('');
    unmount();
    render(<PasswordInput aria-label="Nova" />);
    expect(screen.getByLabelText('Nova')).toHaveAttribute('type', 'password');
  });

  it('Dado um campo desabilitado, quando tento revelar, então permanece oculto', async () => {
    render(<PasswordInput aria-label="Senha" disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
  });

  it('Dado um campo somente leitura, quando revelo, então preserva atributos, referência e proteção de captura', async () => {
    const ref = createRef<HTMLInputElement>();
    render(<PasswordInput ref={ref} id="secret" aria-label="Chave" visibilityLabel="chave" readOnly value="secret" name="key" required minLength={8} autoComplete="off" aria-invalid="true" aria-describedby="error" className="custom" />);
    const input = screen.getByLabelText('Chave');
    expect(ref.current).toBe(input);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar chave' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('required');
    expect(input).toHaveAttribute('minlength', '8');
    expect(input).toHaveAttribute('name', 'key');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'error');
    expect(input).toHaveAttribute('data-ph-no-capture');
    expect(input).toHaveClass('custom', 'ph-mask', 'ph-no-capture');
    expect(input.parentElement).toHaveAttribute('data-ph-no-capture');
  });

  it('Dado um valor controlado, quando edito e revelo, então mantém o callback e o valor recebido', async () => {
    const change = vi.fn();
    const { rerender } = render(<PasswordInput aria-label="Senha" value="antes" onChange={change} />);
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'depois' } });
    expect(change).toHaveBeenCalledOnce();
    rerender(<PasswordInput aria-label="Senha" value="depois" onChange={change} />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByLabelText('Senha')).toHaveValue('depois');
  });
});
