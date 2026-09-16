import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from './PageHeader';

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
