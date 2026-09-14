import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UsageBadge } from './UsageBadge';

const renderBadge = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('UsageBadge', () => {
  it('não renderiza nada quando remaining é null (comportamento atual preservado)', () => {
    const { container } = renderBadge(<UsageBadge remaining={null} limit={100} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra usados e total quando limit é conhecido', () => {
    renderBadge(<UsageBadge remaining={70} limit={100} />);
    expect(screen.getByTestId('usage-badge')).toBeInTheDocument();
    expect(screen.getByText(/30 de 100/i)).toBeInTheDocument();
  });

  it('mostra apenas restantes quando limit é desconhecido (null)', () => {
    renderBadge(<UsageBadge remaining={5} limit={null} />);
    expect(screen.getByTestId('usage-badge')).toBeInTheDocument();
    expect(screen.getByText(/5 criativos restantes/i)).toBeInTheDocument();
  });

  it('usa cor neutra (petróleo) com uso ≤ 50%', () => {
    const { container } = renderBadge(<UsageBadge remaining={60} limit={100} />);
    const badge = container.querySelector('[data-testid="usage-badge"]') as HTMLElement;
    expect(badge.getAttribute('data-tone')).toBe('normal');
  });

  it('muda para alerta (faísca) com uso > 50%', () => {
    const { container } = renderBadge(<UsageBadge remaining={20} limit={100} />);
    const badge = container.querySelector('[data-testid="usage-badge"]') as HTMLElement;
    expect(badge.getAttribute('data-tone')).toBe('warning');
  });

  it('tom de erro e CTA "Fazer upgrade" quando a cota zera', () => {
    renderBadge(<UsageBadge remaining={0} limit={100} />);
    const badge = screen.getByTestId('usage-badge');
    expect(badge.getAttribute('data-tone')).toBe('error');
    const link = screen.getByTestId('usage-upgrade-cta');
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/planos');
  });

  it('renderiza barra de progresso com % usado quando limit é conhecido', () => {
    renderBadge(<UsageBadge remaining={25} limit={100} />);
    const bar = screen.getByTestId('usage-bar');
    expect(bar).toBeInTheDocument();
    expect(bar.getAttribute('data-pct')).toBe('75');
  });

  it('sem barra quando limit é null', () => {
    renderBadge(<UsageBadge remaining={3} limit={null} />);
    expect(screen.queryByTestId('usage-bar')).not.toBeInTheDocument();
  });

  it('remaining > limit (dado inconsistente) não gera % negativo', () => {
    renderBadge(<UsageBadge remaining={102} limit={100} />);
    const bar = screen.getByTestId('usage-bar');
    expect(bar.getAttribute('data-pct')).toBe('0');
    expect(screen.getByText(/0 de 100/i)).toBeInTheDocument();
  });
});
