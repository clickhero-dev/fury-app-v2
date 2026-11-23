import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantsPage } from './TenantsPage';

const mockGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockGet, post: vi.fn(), delete: vi.fn() } }));

const sub = (status: string, plan: string | null) => ({ status, currentPeriodEnd: '2026-12-01', plan: plan ? { name: plan } : null });
const TENANTS = [
  { id: 't-ady', name: 'Bruno Loja', slug: 'bruno', createdAt: '2026-11-03T00:00:00Z', userCount: 1, subscription: sub('trial', 'Teste grátis'), origin: { kind: 'ady', partnerId: null, partnerName: null } },
  { id: 't-cli', name: 'Ana Café', slug: 'ana', createdAt: '2026-11-01T00:00:00Z', userCount: 3, subscription: sub('active', 'Ouro'), origin: { kind: 'partner_client', partnerId: 'p-1', partnerName: 'Alfa' } },
  { id: 't-acc', name: 'Conta Alfa', slug: 'alfa', createdAt: '2026-11-02T00:00:00Z', userCount: 2, subscription: null, origin: { kind: 'partner_account', partnerId: 'p-1', partnerName: 'Alfa' } },
];

const names = () => screen.getAllByText(/^(Bruno Loja|Ana Café|Conta Alfa)$/).map((el) => el.textContent);
const renderPage = () => render(<MemoryRouter><TenantsPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ platformRole: 'super_admin' }));
  mockGet.mockResolvedValue({ data: { data: TENANTS } });
});

describe('TenantsPage — filtros e ordem', () => {
  it('padrão: mais recentes primeiro, com a origem de cada cliente', async () => {
    renderPage();
    await screen.findByText('Bruno Loja');
    expect(names()).toEqual(['Bruno Loja', 'Conta Alfa', 'Ana Café']);
    expect(screen.getByText(/bruno · Cliente ady/)).toBeTruthy();
    expect(screen.getByText(/ana · Parceiro Alfa/)).toBeTruthy();
    expect(screen.getByText(/alfa · Conta do parceiro Alfa/)).toBeTruthy();
  });

  it.each([
    ['ady', ['Bruno Loja']],
    ['partner', ['Conta Alfa', 'Ana Café']],
    ['partner_client', ['Ana Café']],
    ['partner_account', ['Conta Alfa']],
    ['p:p-1', ['Conta Alfa', 'Ana Café']],
  ])('origem %s', async (value, expected) => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Bruno Loja');
    await user.selectOptions(screen.getByLabelText('Filtrar por origem'), value);
    expect(names()).toEqual(expected);
  });

  it('situação, plano e "sem assinatura"', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Bruno Loja');
    await user.selectOptions(screen.getByLabelText('Filtrar por situação'), 'active');
    expect(names()).toEqual(['Ana Café']);
    await user.selectOptions(screen.getByLabelText('Filtrar por situação'), 'Sem assinatura');
    expect(names()).toEqual(['Conta Alfa']);
    await user.selectOptions(screen.getByLabelText('Filtrar por situação'), '');
    await user.selectOptions(screen.getByLabelText('Filtrar por plano'), 'Teste grátis');
    expect(names()).toEqual(['Bruno Loja']);
  });

  it('ordem por nome e por usuários; limpar volta ao padrão', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Bruno Loja');
    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'name');
    expect(names()).toEqual(['Ana Café', 'Bruno Loja', 'Conta Alfa']);
    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'users');
    expect(names()).toEqual(['Ana Café', 'Conta Alfa', 'Bruno Loja']);
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(names()).toEqual(['Bruno Loja', 'Conta Alfa', 'Ana Café']);
    expect(within(screen.getByRole('group', { name: 'Filtros de clientes' })).getByText('3 de 3')).toBeTruthy();
  });

  it('parceiro não vê o filtro de origem', async () => {
    localStorage.setItem('user', JSON.stringify({ platformRole: 'admin_partner' }));
    mockGet.mockResolvedValue({ data: { data: TENANTS.map(({ origin: _o, ...t }) => t) } });
    renderPage();
    await screen.findByText('Bruno Loja');
    expect(screen.queryByLabelText('Filtrar por origem')).toBeNull();
    expect(screen.getByLabelText('Filtrar por situação')).toBeTruthy();
  });
});
