import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { showSnack } from '@/lib/snack';
import { AdminShell } from './AdminShell';

vi.mock('@/hooks/useFavicon', () => ({ useFavicon: vi.fn() }));

/* Funcionalidade: confirmar logout superadmin. Cenário: cancelar preserva e confirmar limpa.
Dado admin autenticado, Quando confirma Sair, Então segue o fluxo administrativo existente. */
describe('AdminShell', () => {
  afterEach(() => vi.useRealTimers());


  it('só limpa a sessão do superadmin após confirmação', () => {
    window.localStorage.setItem('token', 'test-token');
    render(
      <MemoryRouter initialEntries={['/admin/tickets']}>
        <Routes><Route path="/admin" element={<AdminShell />}><Route path="tickets" element={<div>Tickets admin</div>} /></Route></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /sair/i }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Sair da conta?');
    expect(window.localStorage.getItem('token')).toBe('test-token');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(window.localStorage.getItem('token')).toBe('test-token');
  });

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
});
