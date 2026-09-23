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

function renderSidebar(entry = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar — navegação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('agrupa a navegação em seções por tarefa (Gestão / Criação / Conta)', () => {
    renderSidebar();

    expect(screen.getByText('Gestão')).toBeInTheDocument();
    expect(screen.getByText('Criação')).toBeInTheDocument();
    expect(screen.getByText('Conta')).toBeInTheDocument();
  });

  it('renomeia Calendário para Planejamento apontando para /calendario', () => {
    renderSidebar();

    const planejamento = screen.getByRole('link', { name: /planejamento/i });
    expect(planejamento).toHaveAttribute('href', '/calendario');
  });

  it('marca Planejamento como ativo em /calendario', () => {
    renderSidebar('/calendario');

    const planejamento = screen.getByRole('link', { name: /planejamento/i });
    expect(planejamento.className).toContain('bg-sidebar-active');
  });

  it('marca Planejamento como ativo também quando navega em /planejador', () => {
    renderSidebar('/planejador');

    const planejamento = screen.getByRole('link', { name: /planejamento/i });
    expect(planejamento.className).toContain('bg-sidebar-active');
  });

  it('mantém o Planejador IA oculto (feature ainda em teste)', () => {
    renderSidebar();

    expect(screen.queryByRole('link', { name: /planejador ia/i })).toBeNull();
  });

  it('renderiza os itens principais de cada seção com seus destinos', () => {
    renderSidebar();

    expect(screen.getByRole('link', { name: /painel/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /campanhas/i })).toHaveAttribute('href', '/campanhas');
    expect(screen.getByRole('link', { name: /leads/i })).toHaveAttribute('href', '/leads');
    expect(screen.getByRole('link', { name: /estúdio/i })).toHaveAttribute('href', '/estudio');
    expect(screen.getByRole('link', { name: /configurações/i })).toHaveAttribute('href', '/configuracoes');
    expect(screen.getByRole('link', { name: /assinatura/i })).toHaveAttribute('href', '/assinatura');
  });

  it('mantém Integrações como sub-item acessível', () => {
    renderSidebar();

    expect(screen.getByRole('link', { name: /integrações/i })).toHaveAttribute(
      'href',
      '/configuracoes/integracoes',
    );
  });

  it('não exibe Orçamento Smart na navegação', () => {
    renderSidebar();

    expect(screen.queryByRole('link', { name: /orçamento/i })).toBeNull();
  });
});