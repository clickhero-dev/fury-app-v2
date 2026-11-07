// @vitest-environment jsdom
/**
 * Funcionalidade: definir senha no primeiro acesso do trial
 * Cenário: Dado que a conta possui senha provisória, quando o usuário confirma duas senhas iguais,
 * então a senha é salva e o modal deixa de aparecer.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrialPasswordModal } from './TrialPasswordModal';

const { post } = vi.hoisted(() => ({ post: vi.fn().mockResolvedValue({ data: { success: true } }) }));
vi.mock('../../lib/api', () => ({ default: { post } }));

describe('TrialPasswordModal', () => {
  it('salva a nova senha apenas quando confirmação coincide', async () => {
    const onComplete = vi.fn();
    render(<TrialPasswordModal onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'NovaSenha1!' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'NovaSenha1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/set-password', { newPassword: 'NovaSenha1!' }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
