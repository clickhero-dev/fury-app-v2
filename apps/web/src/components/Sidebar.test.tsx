import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { captureEvent } from '@/lib/posthog';

vi.mock('@/lib/posthog', () => ({ captureEvent: vi.fn() }));

const mockCaptureEvent = vi.mocked(captureEvent);

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

  it('aria-current="page" apenas no destino exato (não duplica parent + child)', () => {
    renderSidebar('/configuracoes/integracoes');

    // O sub-item Integrações está na página atual.
    expect(screen.getByRole('link', { name: /integrações/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // O parent Configurações segue visualmente ativo (prefix-match), mas NÃO
    // deve anunciar como página atual — leitores de tela veriam 2 páginas.
    expect(screen.getByRole('link', { name: /configurações/i })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('aria-current="page" no parent quando está exatamente no seu destino', () => {
    renderSidebar('/configuracoes');

    expect(screen.getByRole('link', { name: /configurações/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /integrações/i })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('registra nav_click com o destino/label do CHILD ao clicar em sub-item', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('link', { name: /integrações/i }));

    expect(mockCaptureEvent).toHaveBeenCalledWith('nav_click', {
      to: '/configuracoes/integracoes',
      label: 'Integrações',
    });
  });

  it('registra nav_click com o destino/label do item pai', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('link', { name: /configurações/i }));

    expect(mockCaptureEvent).toHaveBeenCalledWith('nav_click', {
      to: '/configuracoes',
      label: 'Configurações',
    });
  });
});