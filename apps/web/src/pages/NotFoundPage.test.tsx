import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotFoundPage } from './NotFoundPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  );
}

describe('NotFoundPage', () => {
  it('renderiza título e CTA "Voltar ao início" apontando para "/"', () => {
    renderPage();
    expect(screen.getByText('Página não encontrada')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /voltar ao início/i });
    expect(cta).toHaveAttribute('href', '/');
  });

  it('CTA usa a identidade Ady (Petróleo), não o laranja legado', () => {
    renderPage();
    const cta = screen.getByRole('link', { name: /voltar ao início/i });
    expect(cta.className).toContain('bg-brand');
    expect(cta.className).not.toContain('gradient-spark');
  });
});
