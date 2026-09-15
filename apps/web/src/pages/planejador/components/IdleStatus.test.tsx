import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IdleStatus } from './IdleStatus';

vi.mock('@/hooks/useBilling', () => ({
  useSubscription: vi.fn(() => ({ data: { currentPeriodEnd: null } })),
}));

const renderIdle = (props: Partial<Parameters<typeof IdleStatus>[0]> = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <IdleStatus
          onGenerate={() => {}}
          isLoading={false}
          creativesRemaining={null}
          creativesLimit={null}
          quotaSufficient={true}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('IdleStatus — destaque do consumo de crédito', () => {
  it('exibe badge de cota com barra quando quota conhecida', () => {
    renderIdle({ creativesRemaining: 3, creativesLimit: 8 });
    const badge = screen.getByTestId('usage-badge');
    expect(badge.getAttribute('data-tone')).toBe('warning');
    expect(screen.getByTestId('usage-pct').textContent).toContain('3 de 8');
    expect(screen.getByTestId('usage-bar')).toBeInTheDocument();
  });

  it('não exibe badge quando quota desconhecida (null)', () => {
    renderIdle();
    expect(screen.queryByTestId('usage-badge')).not.toBeInTheDocument();
  });

  it('badge em erro + CTA quando cota zerada; botão desabilitado', () => {
    renderIdle({ creativesRemaining: 0, creativesLimit: 8, quotaSufficient: false });
    const badge = screen.getByTestId('usage-badge');
    expect(badge.getAttribute('data-tone')).toBe('error');
    expect(screen.getByTestId('usage-upgrade-cta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gerar planejamento/i })).toBeDisabled();
  });
});
