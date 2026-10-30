import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { showSnack } from '@/lib/snack';
import { AdminShell } from './AdminShell';

vi.mock('@/hooks/useFavicon', () => ({ useFavicon: vi.fn() }));

describe('AdminShell', () => {
  afterEach(() => vi.useRealTimers());

  it('renderiza snacks globais disparados pelas páginas administrativas', () => {
    render(
      <MemoryRouter initialEntries={['/admin/tickets']}>
        <Routes>
          <Route path="/admin" element={<AdminShell />}>
            <Route path="tickets" element={<Outlet />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    act(() => showSnack('Ticket aberto com sucesso.', 'success'));

    expect(screen.getByRole('status')).toHaveTextContent('Ticket aberto com sucesso.');
  });

  // Funcionalidade: confirmação de logout superadmin
  // Cenário: cancelar preserva sessão e confirmar encerra a sessão no login administrativo.
  it('só limpa a sessão e navega ao login depois de confirmar', async () => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('refreshToken', 'test-refresh');
    localStorage.setItem('user', 'test-user');
    render(
      <MemoryRouter initialEntries={['/admin/tickets']}>
        <Routes>
          <Route path="/admin" element={<AdminShell />}>
            <Route path="tickets" element={<Outlet />} />
            <Route path="login" element={<div>Admin login</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('dialog', { name: 'Sair da conta?' })).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBe('test-token');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(localStorage.getItem('token')).toBe('test-token');
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sim, sair' }));
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(await screen.findByText('Admin login')).toBeInTheDocument();
  });
});
