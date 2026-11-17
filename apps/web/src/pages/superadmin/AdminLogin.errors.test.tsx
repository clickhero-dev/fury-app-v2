import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AdminLogin } from './AdminLogin';

// sem mockReset no beforeEach: no vitest 4 ele faz a rejeição simulada vazar como falha
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { post } }));

async function submit() {
  render(<MemoryRouter><AdminLogin /></MemoryRouter>);
  await userEvent.type(screen.getByPlaceholderText('admin@ady.com.br'), 'a@b.com');
  await userEvent.type(screen.getByLabelText('Senha'), 'Senha123');
  await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
}

it('Dado senha errada, então a mensagem continua genérica (não revela o e-mail)', async () => {
  post.mockRejectedValue(Object.assign(new Error('401'), { isAxiosError: true, response: { status: 401, data: { error: { code: 'INVALID_CREDENTIALS', message: 'x' } } } }));
  await submit();
  expect(await screen.findByText('Email ou senha incorretos')).toBeInTheDocument();
});

it('Dado servidor fora do ar, então diz que não há conexão', async () => {
  post.mockRejectedValue(Object.assign(new Error('Network Error'), { isAxiosError: true }));
  await submit();
  expect(await screen.findByText(/^Não foi possível entrar\. Sem conexão com o servidor/)).toBeInTheDocument();
});
