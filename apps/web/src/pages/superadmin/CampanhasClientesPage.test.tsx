import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CampanhasClientesPage } from './CampanhasClientesPage';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get: mockGet } }));

const tenants = [
  { id: 't1', name: 'Cliente 1 Alfa', slug: 'cliente-1-alfa' },
  { id: 't2', name: 'Cliente 2 Alfa', slug: 'cliente-2-alfa' },
];

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/admin/campanhas']}>
      <Routes>
        <Route path="/admin/campanhas" element={<CampanhasClientesPage />} />
        <Route path="/admin/tenants/:id/campaigns" element={<div>tela de campanhas</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CampanhasClientesPage', () => {
  beforeEach(() => { mockGet.mockReset(); });

  it('clicar no cliente abre direto as campanhas dele', async () => {
    mockGet.mockResolvedValue({ data: { data: tenants } });
    renderPage();
    fireEvent.click(await screen.findByText('Cliente 2 Alfa'));
    expect(await screen.findByText('tela de campanhas')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/admin/tenants');
  });

  it('busca filtra por nome', async () => {
    mockGet.mockResolvedValue({ data: { data: tenants } });
    renderPage();
    await screen.findByText('Cliente 1 Alfa');
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: '2 alfa' } });
    expect(screen.queryByText('Cliente 1 Alfa')).toBeNull();
    expect(screen.getByText('Cliente 2 Alfa')).toBeInTheDocument();
  });

  it('erro ao carregar mostra aviso', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByText('Erro ao carregar clientes')).toBeInTheDocument();
  });

  it('pagina de 10 em 10 e a busca volta para a página 1', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `c${i + 1}`, name: `Cliente ${i + 1}`, slug: `cliente-${i + 1}` }));
    mockGet.mockResolvedValue({ data: { data: many } });
    renderPage();
    await screen.findByText('Cliente 1');
    expect(screen.queryByText('Cliente 11')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Cliente 15')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'Cliente 1' } });
    // 7 resultados (1, 10–15): uma página, sem paginação
    expect(screen.getByText('Cliente 1')).toBeInTheDocument();
    expect(screen.getByText('Cliente 10')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).toBeNull();
  });
});
