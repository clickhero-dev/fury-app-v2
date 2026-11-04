/*
Funcionalidade: super_admin bloqueia telas por parceiro e no padrão

Cenário: liga e desliga uma tela
  Quando o super_admin desliga "Estúdio" na aba Permissões do parceiro
  Então a API recebe o bloqueio e a lista mostra o novo estado

Cenário: item travado
  Dado que "Metas" está bloqueado no padrão
  Então aparece desligado, travado e com "Bloqueado para todos"

Cenário: erro ao salvar
  Quando a API recusa
  Então a mensagem aparece e o interruptor continua como estava
*/
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsPanel, type Permission } from './PermissionsPanel';
import { PartnerConfigPage } from './PartnerConfigPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPut = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockGet, put: mockPut, patch: vi.fn() } }));

const base: Permission[] = [
  { key: 'goals', description: 'Metas', blocked: false, locked: true },
  { key: 'studio', description: 'Estúdio', blocked: false, locked: false },
  { key: 'studio.video', description: 'Gerador de vídeo', blocked: false, locked: false },
  { key: 'campaigns', description: 'Campanhas', blocked: false, locked: false },
];
const partner = { id: 'p-1', name: 'Parceira Um', maxTenants: 10, usedTenants: 7, accountEmail: 'um@x.com', keyLast4: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation((url: string) =>
    Promise.resolve({ data: { data: url.endsWith('/permissions') || url.endsWith('/default') ? base : partner } }),
  );
});

describe('PermissionsPanel', () => {
  it('desligar envia o bloqueio e mostra o estado devolvido', async () => {
    mockPut.mockResolvedValue({
      data: {
        data: base.map((p) =>
          p.key === 'studio' ? { ...p, blocked: true } : p.key === 'studio.video' ? { ...p, locked: true } : p,
        ),
      },
    });
    render(<PermissionsPanel partnerId="p-1" />);

    const studio = await screen.findByRole('switch', { name: 'Estúdio' });
    expect(studio).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(studio);

    expect(mockPut).toHaveBeenCalledWith('/admin/partners/p-1/permissions', { viewKey: 'studio', blocked: true });
    expect(await screen.findByRole('switch', { name: 'Estúdio' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Gerador de vídeo' })).toBeDisabled();
    expect(screen.getByText('Bloqueado junto com Estúdio')).toBeInTheDocument();
  });

  it('item travado aparece desligado e sem clique', async () => {
    render(<PermissionsPanel partnerId="p-1" />);
    const goals = await screen.findByRole('switch', { name: 'Metas' });
    expect(goals).toHaveAttribute('aria-checked', 'false');
    expect(goals).toBeDisabled();
    expect(screen.getByText('Bloqueado para todos')).toBeInTheDocument();
    expect(screen.getByText(/Também bloqueia a tela de Leads/)).toBeInTheDocument();
  });

  it('padrão usa a rota de todos; erro mantém o estado', async () => {
    mockPut.mockRejectedValue(new Error('x'));
    render(<PermissionsPanel partnerId={null} />);
    await userEvent.click(await screen.findByRole('switch', { name: 'Estúdio' }));

    expect(mockGet).toHaveBeenCalledWith('/admin/permissions/default');
    expect(mockPut).toHaveBeenCalledWith('/admin/permissions/default', { viewKey: 'studio', blocked: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar.');
    expect(screen.getByRole('switch', { name: 'Estúdio' })).toHaveAttribute('aria-checked', 'true');
  });

  it('aba Permissões no parceiro', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/parceiros/p-1']}>
        <Routes>
          <Route path="/admin/parceiros/:id" element={<PartnerConfigPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Permissões' }));
    expect(await screen.findByRole('switch', { name: 'Estúdio' })).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/admin/partners/p-1/permissions');
  });
});
