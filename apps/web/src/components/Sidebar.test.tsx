import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

vi.mock('@/lib/posthog', () => ({ captureEvent: vi.fn() }));

vi.mock('@/hooks/useLogout', () => ({ useLogout: () => vi.fn() }));

// SidebarUserCard depende de useAuth/useBilling — fora do escopo deste teste
// (a cobertura aqui é a navegação). Renderiza um slot neutro.
vi.mock('./SidebarUserCard', () => ({
  SidebarUserCard: () => <div data-testid="sidebar-user-card" />,
}));

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar — navegação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza o link do Calendário apontando para /calendario', () => {
    renderSidebar();

    const calendario = screen.getByRole('link', { name: /calendário/i });
    expect(calendario).toHaveAttribute('href', '/calendario');
  });

  it('mantém o Planejador IA oculto (feature ainda em teste)', () => {
    renderSidebar();

    expect(screen.queryByRole('link', { name: /planejador ia/i })).toBeNull();
  });

  it('renderiza os demais itens de navegação principais', () => {
    renderSidebar();

    expect(screen.getByRole('link', { name: /painel/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /campanhas/i })).toHaveAttribute('href', '/campanhas');
    expect(screen.getByRole('link', { name: /leads/i })).toHaveAttribute('href', '/leads');
    expect(screen.getByRole('link', { name: /estúdio/i })).toHaveAttribute('href', '/estudio');
    expect(screen.getByRole('link', { name: /integrações/i })).toHaveAttribute('href', '/configuracoes/integracoes');
    expect(screen.getByRole('link', { name: /configurações/i })).toHaveAttribute('href', '/configuracoes');
    expect(screen.getByRole('link', { name: /assinatura/i })).toHaveAttribute('href', '/assinatura');
  });
});