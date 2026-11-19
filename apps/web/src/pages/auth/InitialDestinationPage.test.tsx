/* # language: pt-BR
Funcionalidade: Home universal independente de plano
  Cenário: a rota é protegida pelo shell e não consulta plano para escolher destino
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InitialDestinationPage } from './InitialDestinationPage';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({default:{get}}));
beforeEach(() => { localStorage.clear(); get.mockReset(); });
describe('Home', () => {
  it('mostra quatro ações com benefício acessível sem buscar plano para escolher destino', () => {
    localStorage.setItem('token', 'sessao');
    render(<MemoryRouter><InitialDestinationPage /></MemoryRouter>);
    expect(screen.getByRole('heading',{name:'O que vamos fazer hoje?'})).toBeInTheDocument();
    const cards = [
      ['Não sei por onde começar','orientacao'], ['Criar conteúdo para minhas redes','conteudo'],
      ['Planejar minha semana','semana'], ['Atrair mais clientes','clientes'],
    ];
    for (const [name,id] of cards) {
      expect(screen.getByRole('link',{name})).toHaveAttribute('href', `/chat?inicio=${id}`);
      expect(screen.getByRole('link',{name})).toHaveAccessibleDescription(/.+/);
    }
    expect(get).not.toHaveBeenCalled();
  });
});
