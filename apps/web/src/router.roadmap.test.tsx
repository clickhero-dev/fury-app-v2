/*
Funcionalidade: abrir o Roadmap público pela rota canônica

Cenário: visitante sem sessão abre /roadmap
  Dado que a pessoa não está autenticada
  Quando navega diretamente para /roadmap
  Então a página pública do Roadmap é exibida sem redirecionamento para login
*/
import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { router } from './router';

describe('rota pública do Roadmap', () => {
  afterEach(async () => {
    await router.navigate('/login');
  });

  it('renderiza o Roadmap diretamente em /roadmap', async () => {
    await router.navigate('/roadmap');
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Roadmap do Ady', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /entrar/i })).not.toBeInTheDocument();
  });
});
