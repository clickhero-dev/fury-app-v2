/*
Funcionalidade: recuperação de erro OAuth no onboarding
  Cenário: erro da callback oferece nova tentativa com rerequest
    Dado que a Meta devolveu um erro OAuth
    Quando a pessoa vê a tela Conectar Meta
    Então pode iniciar novamente o fluxo com rerequest
*/
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConectarMetaPage } from './ConectarMetaPage';

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}{useLocation().search}</span>;
}

describe('ConectarMetaPage', () => {
  it('oferece retry com rerequest após erro OAuth', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/onboarding/conectar-meta?error=ad_account_in_use']}>
          <ConectarMetaPage />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('ad_account_in_use');
    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/onboarding/meta-authorize?rerequest=true');
  });
});
