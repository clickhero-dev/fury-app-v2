import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { showSnack } from '@/lib/snack';
import { AdminShell } from './AdminShell';

vi.mock('@/hooks/useFavicon', () => ({ useFavicon: vi.fn() }));
vi.mock('@/hooks/useBlockedViews', () => ({ useBlockedViews: () => ({ isBlocked: () => false }) }));

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
    expect(screen.getByRole('link', { name: /clientes/i })).toHaveAttribute('href', '/admin/clientes');
    expect(screen.getByRole('link', { name: /planos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /integrações/i })).toBeInTheDocument();
    expect(screen.queryByText('conteúdo tickets')).toBeNull();
    localStorage.clear();
  });

  it('super_admin não vê a tela Clientes do parceiro; Clientes dele é a lista completa', () => {
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

    expect(screen.getByRole('link', { name: /clientes/i })).toHaveAttribute('href', '/admin/tenants');
    expect(screen.queryByRole('link', { name: /integrações/i })).toBeNull();
    expect(screen.queryByText('conteúdo clientes')).toBeNull();
    expect(screen.getByRole('link', { name: /parceiros/i })).toBeInTheDocument();
    localStorage.clear();
  });

  it('Campanhas é link direto para a escolha de cliente', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'owner', platformRole: 'admin_partner' }));
    render(
      <MemoryRouter initialEntries={['/admin/tenants/t1/campaigns']}>
        <Routes>
          <Route path="/admin" element={<AdminShell />}>
            <Route path="tenants/:id/campaigns" element={<div>campanhas</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /campanhas/i });
    expect(link).toHaveAttribute('href', '/admin/campanhas');
    expect(link.className).toContain('font-semibold');
    expect(screen.getByRole('link', { name: /clientes/i }).className).not.toContain('font-semibold');
    localStorage.clear();
  });

  it('detalhe do cliente marca Clientes, não Usuários', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'owner', platformRole: 'super_admin' }));
    render(
      <MemoryRouter initialEntries={['/admin/tenants/t1']}>
        <Routes>
          <Route path="/admin" element={<AdminShell />}>
            <Route path="tenants/:id" element={<div>detalhe</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /clientes/i }).className).toContain('font-semibold');
    expect(screen.getByRole('link', { name: /usuários/i }).className).not.toContain('font-semibold');
    expect(screen.getByRole('link', { name: /campanhas/i }).className).not.toContain('font-semibold');
    localStorage.clear();
  });
});
