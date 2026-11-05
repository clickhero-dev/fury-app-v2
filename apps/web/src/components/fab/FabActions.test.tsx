import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { FabActions } from './FabActions';

vi.mock('@/lib/posthog', () => ({ captureEvent: vi.fn() }));

// Probe para ler a navegação real sob o MemoryRouter (window.location não muda).
function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location-probe">
      {location.pathname}
      {location.search}
    </span>
  );
}

function renderFab(entry = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <FabActions />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('FabActions — ações flutuantes de criação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza as 3 ações com nome acessível (ícone-only exige aria-label)', () => {
    renderFab();

    expect(screen.getByRole('button', { name: /criar campanha/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /criar imagem/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /postar/i })).toBeInTheDocument();
  });

  it('navega para o wizard de campanha ao clicar em "Criar campanha"', async () => {
    const user = userEvent.setup();
    renderFab();

    await user.click(screen.getByRole('button', { name: /criar campanha/i }));

    expect(screen.getByTestId('location-probe').textContent).toBe('/criar-campanha');
  });

  it('navega para a Criação rápida do Estúdio ao clicar em "Criar imagem" (deep-link ?criar=rapida)', async () => {
    const user = userEvent.setup();
    renderFab();

    await user.click(screen.getByRole('button', { name: /criar imagem/i }));

    expect(screen.getByTestId('location-probe').textContent).toBe('/estudio?criar=rapida');
  });

  it('abre o fluxo de postagem no Calendário (deep-link ?criar=post)', async () => {
    const user = userEvent.setup();
    renderFab();

    await user.click(screen.getByRole('button', { name: /postar/i }));

    expect(screen.getByTestId('location-probe').textContent).toBe('/calendario?criar=post');
  });

  it('não renderiza nas rotas excluídas (wizard, onboarding, política, admin...)', () => {
    const excluded = [
      '/criar-campanha',
      '/onboarding/conectar-meta',
      '/politica',
      '/assinatura-vencida',
      '/admin',
      '/admin/dashboard',
      '/components-demo',
    ];
    for (const entry of excluded) {
      const { unmount } = renderFab(entry);
      expect(screen.queryByRole('button', { name: /criar campanha/i })).toBeNull();
      unmount();
    }
  });

  it('renderiza nas telas de trabalho (dashboard, calendário, estúdio)', () => {
    const visible = ['/dashboard', '/calendario', '/estudio', '/campanhas', '/leads'];
    for (const entry of visible) {
      const { unmount } = renderFab(entry);
      expect(screen.getByRole('button', { name: /criar campanha/i })).toBeInTheDocument();
      unmount();
    }
  });
});