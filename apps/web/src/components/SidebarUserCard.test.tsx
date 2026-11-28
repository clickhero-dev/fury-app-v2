import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarUserCard } from './SidebarUserCard';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { name: null, email: 'a@x.com' }, isLoading: false }) }));
vi.mock('@/hooks/useBilling', () => ({ useSubscription: () => ({ data: null, isLoading: false }) }));

describe('SidebarUserCard', () => {
  afterEach(() => localStorage.clear());

  it('cliente sem assinatura: mostra "Sem plano ativo"', () => {
    localStorage.setItem('user', JSON.stringify({ platformRole: 'user' }));
    render(<SidebarUserCard />);
    expect(screen.getByText('Sem plano ativo')).toBeInTheDocument();
  });

  it('conta do parceiro (ele ou a equipe): sem a linha do plano', () => {
    localStorage.setItem('user', JSON.stringify({ platformRole: 'user_partner', partnerAccount: true }));
    render(<SidebarUserCard />);
    expect(screen.getByText('Meu Perfil')).toBeInTheDocument();
    expect(screen.queryByText('Sem plano ativo')).not.toBeInTheDocument();
  });
});
