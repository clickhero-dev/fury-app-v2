import { act, render, screen } from '@testing-library/react';
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
});
