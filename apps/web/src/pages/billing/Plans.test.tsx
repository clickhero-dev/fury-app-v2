/*
Funcionalidade: tela de planos do cliente

Cenário: cliente de parceiro
  Dado que o cliente é de um parceiro (user_partner)
  Então vê os planos do parceiro com o botão desativado, sem textos de Asaas e de trial

Cenário: parceiro sem planos
  Então aparece o aviso, sem os planos de exemplo

Cenário: cliente ady
  Então o botão de assinar abre o pagamento, como hoje
*/
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Plans } from './Plans';

const mockPlans = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useBilling', () => ({
  usePlans: mockPlans,
  useSubscription: () => ({ data: null }),
  useSubscribe: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { name: 'Ana', email: 'ana@x.com' } }) }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const partnerPlan = { id: 'pl-1', name: 'Básico Parceiro', priceCents: 5000, interval: 'monthly', features: ['Suporte'], isActive: true, createdAt: '' };

function renderAs(platformRole: string, plans: unknown[]) {
  localStorage.setItem('user', JSON.stringify({ platformRole }));
  mockPlans.mockReturnValue({ data: plans, isLoading: false });
  render(<MemoryRouter><Plans /></MemoryRouter>);
}

afterEach(() => localStorage.clear());

describe('Plans', () => {
  it('cliente de parceiro: botão desativado e sem Asaas/trial', () => {
    renderAs('user_partner', [partnerPlan]);
    expect(screen.getByText('Básico Parceiro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fale com seu parceiro' })).toBeDisabled();
    expect(screen.queryByText(/Asaas/)).toBeNull();
    expect(screen.queryByText(/7 dias de trial/)).toBeNull();
  });

  it('parceiro sem planos: aviso, sem planos de exemplo', () => {
    renderAs('user_partner', []);
    expect(screen.getByText('Seu parceiro ainda não publicou planos.')).toBeInTheDocument();
    expect(screen.queryByText('Starter')).toBeNull();
  });

  it('cliente ady: assinar abre o pagamento', async () => {
    renderAs('user', [{ ...partnerPlan, name: 'Pro' }]);
    expect(screen.getByText(/Asaas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Assinar agora' }));
    expect(screen.getByText('Assinar plano Pro')).toBeInTheDocument();
  });
});
