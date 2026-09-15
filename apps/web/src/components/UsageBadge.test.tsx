import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UsageBadge } from './UsageBadge';

const mockUseSubscription = vi.hoisted(() => vi.fn(() => ({ data: null })));
vi.mock('@/hooks/useBilling', () => ({ useSubscription: mockUseSubscription }));

const renderBadge = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mockUseSubscription.mockReturnValue({ data: { currentPeriodEnd: null } });
});

describe('UsageBadge', () => {
  it('não renderiza nada quando remaining é null (comportamento atual preservado)', () => {
    const { container } = renderBadge(<UsageBadge remaining={null} limit={100} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra usados e total quando limit é conhecido', () => {
    renderBadge(<UsageBadge remaining={70} limit={100} />);
    expect(screen.getByTestId('usage-badge')).toBeInTheDocument();
    expect(screen.getByTestId('usage-label').textContent).toBe('Uso mensal');
  });

  it('mostra apenas restantes quando limit é desconhecido (null)', () => {
    renderBadge(<UsageBadge remaining={5} limit={null} />);
    expect(screen.getByTestId('usage-badge')).toBeInTheDocument();
    expect(screen.getByTestId('usage-pct').textContent).toContain('5 restantes');
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
    expect(screen.getByTestId('usage-pct').textContent).toContain('102 de 100');
  });

  // — UX polish (ui-ux-pro-max): acessibilidade + rótulo compacto —

  it('rótulo compacto sem risco de quebra: "30/100 usados" em nowrap', () => {
    renderBadge(<UsageBadge remaining={70} limit={100} />);
    const label = screen.getByTestId('usage-label');
    expect(label.textContent).toBe('Uso mensal');
    expect(label.className).toContain('whitespace-nowrap');
  });

  it('não depende só de cor: ícone + texto em todos os tons', () => {
    const { container: c1, unmount: u1 } = renderBadge(<UsageBadge remaining={60} limit={100} />);
    expect(c1.querySelector('[data-testid="usage-icon"]')).not.toBeNull();
    u1();
    const { unmount: u2 } = renderBadge(<UsageBadge remaining={20} limit={100} />);
    expect(document.querySelector('[data-testid="usage-icon"]')).not.toBeNull();
    u2();
    const { unmount: u3 } = renderBadge(<UsageBadge remaining={0} limit={100} />);
    expect(document.querySelector('[data-testid="usage-icon"]')).not.toBeNull();
    u3();
  });

  it('status anunciável: role="status" com mensagem atômica (não número puro)', () => {
    renderBadge(<UsageBadge remaining={5} limit={20} />);
    const badge = screen.getByTestId('usage-badge');
    expect(badge.getAttribute('role')).toBe('status');
    expect(badge.getAttribute('aria-atomic')).toBe('true');
    expect(badge.textContent).toContain('Uso mensal');
    expect(badge.textContent).toContain('5 de 20');
  });

  it('barra exposta a AT: role="progressbar" com valuemin/now/max', () => {
    renderBadge(<UsageBadge remaining={10} limit={20} />);
    const bar = screen.getByTestId('usage-bar-wrap');
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-label')).toContain('Cota de criativos');
  });

  it('mostra "renova em N dias" vindo da assinatura', () => {
    mockUseSubscription.mockReturnValue({
      data: { currentPeriodEnd: new Date(Date.now() + 12 * 86400000).toISOString() },
    });
    renderBadge(<UsageBadge remaining={10} limit={20} />);
    expect(screen.getByTestId('usage-renew').textContent).toContain('renova em 12 dias');
  });

  it('layout estilo "Uso mensal": título à esquerda, cota à direita, % na barra', () => {
    renderBadge(<UsageBadge remaining={5} limit={20} />);
    expect(screen.getByTestId('usage-label').textContent).toBe('Uso mensal');
    expect(screen.getByTestId('usage-pct').textContent).toContain('5 de 20');
    expect(screen.getByTestId('usage-bar').getAttribute('data-pct')).toBe('75');
  });

  it('tooltip explica: "Seu plano tem X criativos por mês. Você pode criar ainda Y neste mês."', () => {
    renderBadge(<UsageBadge remaining={5} limit={20} />);
    const trigger = screen.getByTestId('usage-tooltip-trigger');
    expect(trigger.getAttribute('aria-label')).toMatch(/plano tem 20 criativos/i);
    expect(trigger.getAttribute('aria-label')).toMatch(/pode criar ainda 5/i);
  });

  it('tooltip em cota zerada explica que não é possível criar mais este mês', () => {
    renderBadge(<UsageBadge remaining={0} limit={20} />);
    const trigger = screen.getByTestId('usage-tooltip-trigger');
    expect(trigger.getAttribute('aria-label')).toMatch(/não é possível criar novos criativos/i);
  });

  it('compacto por padrão: sem linha de renovação visível', () => {
    mockUseSubscription.mockReturnValue({
      data: { currentPeriodEnd: new Date(Date.now() + 12 * 86400000).toISOString() },
    });
    renderBadge(<UsageBadge remaining={10} limit={20} />);
    const renew = screen.getByTestId('usage-renew');
    expect(renew.className).toContain('max-h-0');
    expect(renew.className).toContain('opacity-0');
  });

  it('no hover expande: linha de renovação visível ("renova em 12 dias")', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockUseSubscription.mockReturnValue({
      data: { currentPeriodEnd: new Date(Date.now() + 12 * 86400000).toISOString() },
    });
    renderBadge(<UsageBadge remaining={10} limit={20} />);
    const badge = screen.getByTestId('usage-badge');
    await user.hover(badge);
    const renew = screen.getByTestId('usage-renew');
    expect(renew.className).toContain('max-h-8');
    expect(renew.className).toContain('opacity-100');
    expect(renew.textContent).toContain('renova em 12 dias');
  });

  it('transição de altura suave (transition-[max-height,opacity])', () => {
    renderBadge(<UsageBadge remaining={10} limit={20} />);
    const renew = screen.getByTestId('usage-renew');
    expect(String(renew.className)).toMatch(/transition|duration/);
  });

  it('CTA upgrade com anel de foco visível', () => {
    renderBadge(<UsageBadge remaining={0} limit={100} />);
    const link = screen.getByTestId('usage-upgrade-cta');
    expect(link.className).toContain('focus-visible:ring-2');
  });
});
