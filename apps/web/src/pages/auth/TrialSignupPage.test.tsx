/*
 * Funcionalidade: solicitar acesso ao Trial
 * Cenários:
 * - Dado dados válidos, quando envia o formulário, então vê confirmação genérica.
 * - Dado resposta com detalhes internos, quando conclui, então mostra apenas confirmação genérica.
 * - Dado a tela de solicitação, quando consulta a oferta, então vê os limites do Trial.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { post: postMock } }));
import { TrialSignupPage } from './TrialSignupPage';

function renderPage() {
  return render(<MemoryRouter><TrialSignupPage /></MemoryRouter>);
}

beforeEach(() => postMock.mockReset());

describe('TrialSignupPage', () => {
  it('Dado dados válidos, quando envia o formulário, então confirma sem expor a conta', async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({ data: { success: true } });
    renderPage();
    await user.type(screen.getByLabelText(/nome/i), 'Ana');
    await user.type(screen.getByLabelText(/e-mail/i), 'ana@example.com');
    await user.type(screen.getByLabelText(/telefone/i), '11999999999');
    await user.click(screen.getByRole('button', { name: /solicitar trial/i }));
    expect(postMock).toHaveBeenCalledWith('/public/trial/signup', { name: 'Ana', email: 'ana@example.com', phone: '11999999999' });
    expect(await screen.findByRole('status')).toHaveTextContent('Se os dados forem elegíveis, você receberá instruções por e-mail.');
  });

  it('Dado resposta com detalhes internos, quando conclui, então mostra apenas confirmação genérica', async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({ data: { success: false, data: { message: 'email já cadastrado' } } });
    renderPage();
    await user.type(screen.getByLabelText(/nome/i), 'Ana');
    await user.type(screen.getByLabelText(/e-mail/i), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: /solicitar trial/i }));
    expect(await screen.findByRole('status')).toHaveTextContent('Se os dados forem elegíveis, você receberá instruções por e-mail.');
    expect(screen.queryByText(/cadastrado/i)).toBeNull();
  });

  it('Dado a tela de solicitação, quando consulta a oferta, então vê os limites do Trial', () => {
    renderPage();
    expect(screen.getByText(/7 dias/i)).toBeInTheDocument();
    expect(screen.getByText(/até 5 imagens/i)).toBeInTheDocument();
    expect(screen.getByText(/até 3 ajustes por criação/i)).toBeInTheDocument();
    expect(screen.getByText(/vídeos não incluídos/i)).toBeInTheDocument();
  });
});
