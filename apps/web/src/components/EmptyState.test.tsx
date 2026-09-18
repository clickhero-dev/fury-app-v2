import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

/**
 * Card 86e3a8rjy(b): CTAs primários no modo light estavam com pouco destaque —
 * o `.bg-accent` era sobrescrito (html:not(.dark)) para teal claro. O CTA passa
 * a usar a variante AA spark (#B55F02), autocontida nos dois temas.
 */
describe('EmptyState — CTA primário AA', () => {
  it('botão de ação usa a cor AA spark (bg-[#B55F02]) em vez de bg-accent', () => {
    render(
      <EmptyState
        title="Título"
        description="Descrição"
        action={{ label: 'Criar', onClick: () => {} }}
      />,
    );

    const btn = screen.getByRole('button', { name: 'Criar' });
    expect(btn.className).toContain('bg-[#B55F02]');
    expect(btn.className).not.toContain('bg-accent');
  });

  it('ícone de fundo mantém o tom translúcido (bg-accent/10), sem virar sólido', () => {
    const { container } = render(<EmptyState title="Título" description="Descrição" />);
    expect(container.querySelector('.bg-accent\\/10')).not.toBeNull();
  });
});
