import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IdleStatus } from './IdleStatus';

const renderIdle = (props: Partial<Parameters<typeof IdleStatus>[0]> = {}) =>
  render(
    <MemoryRouter>
      <IdleStatus
        onGenerate={() => {}}
        isLoading={false}
        creativesRemaining={null}
        creativesLimit={null}
        quotaSufficient={true}
        {...props}
      />
    </MemoryRouter>,
  );

describe('IdleStatus — destaque do consumo de crédito', () => {
  it('exibe badge de cota com barra quando quota conhecida', () => {
    renderIdle({ creativesRemaining: 3, creativesLimit: 8 });
    const badge = screen.getByTestId('usage-badge');
    expect(badge.getAttribute('data-tone')).toBe('warning');
    expect(screen.getByText(/5 de 8 criativos usados este mês/i)).toBeInTheDocument();
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
