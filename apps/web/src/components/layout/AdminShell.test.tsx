import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { showSnack } from '@/lib/snack';
import { AdminShell } from './AdminShell';

vi.mock('@/hooks/useFavicon', () => ({ useFavicon: vi.fn() }));
vi.mock('@/hooks/useBlockedViews', () => ({ useBlockedViews: () => ({ isBlocked: () => false }) }));

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

  it('admin_partner não vê as telas só do super_admin', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'owner', platformRole: 'admin_partner' }));
    render(
      <MemoryRouter initialEntries={['/admin/tickets']}>
        <Routes>
          <Route path="/admin" element={<AdminShell />}>
            <Route path="tickets" element={<div>conteúdo tickets</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: /tickets/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /faqs/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /parceiros/i })).toBeNull();
    expect(screen.getByRole('link', { name: /usuários/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /clientes/i })).toBeInTheDocument();
    expect(screen.queryByText('conteúdo tickets')).toBeNull();
    localStorage.clear();
  });

  it('super_admin não vê a tela Clientes (só do parceiro)', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'owner', platformRole: 'super_admin' }));
    render(
      <MemoryRouter initialEntries={['/admin/clientes']}>
        <Routes>
          <Route path="/admin" element={<AdminShell />}>
            <Route path="clientes" element={<div>conteúdo clientes</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: /clientes/i })).toBeNull();
    expect(screen.queryByText('conteúdo clientes')).toBeNull();
    expect(screen.getByRole('link', { name: /parceiros/i })).toBeInTheDocument();
    localStorage.clear();
  });
});
