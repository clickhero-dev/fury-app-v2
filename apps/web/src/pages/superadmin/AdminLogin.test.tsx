import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { AdminLogin } from './AdminLogin';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { post } }));
beforeEach(() => post.mockReset());

it('Dado o acesso administrativo, quando revelo a senha, então preserva o valor e não envia', async () => {
  render(<MemoryRouter><AdminLogin /></MemoryRouter>);
  const input = screen.getByLabelText('Senha');
  expect(input).toHaveAttribute('type', 'password');
  await userEvent.type(input, 'Senha123');
  await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
  expect(input).toHaveAttribute('type', 'text');
  expect(input).toHaveValue('Senha123');
  expect(post).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
  expect(input).toHaveAttribute('type', 'password');
});
