import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from './PageHeader';

describe('PageHeader — badge de cota alinhado ao bloco do título', () => {
  it('renderiza conteúdo extra abaixo do título/descrição, alinhado à esquerda', () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="Estúdio de anúncios"
          description="Peças prontas para publicar"
        >
          <div data-testid="quota-slot" className="pt-1">
            <span>badge</span>
          </div>
        </PageHeader>
      </MemoryRouter>,
    );
    const title = screen.getByRole('heading', { name: /estúdio de anúncios/i });
    const slot = screen.getByTestId('quota-slot');
    // slot vem depois do bloco do título e dentro da mesma coluna esquerda
    expect(title.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slot.closest('.space-y-1')).not.toBeNull();
  });

});

describe('PageHeader — título', () => {
  it('usa token semântico de cor (não branco hardcoded) para funcionar no modo claro', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Estúdio de anúncios" />
      </MemoryRouter>,
    );
    const title = screen.getByRole('heading', { name: /estúdio de anúncios/i });
    expect(title.className).toContain('text-text-primary');
    expect(title.className).not.toContain('#ECEDEF');
  });
});
