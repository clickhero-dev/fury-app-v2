/*
# Language: pt-BR

Funcionalidade: preparar uma campanha Google Ads sem publicar durante a Fase 1

  Cenário: consultar o formulário mock
    Dado que a pessoa escolheu Google
    Quando o formulário é aberto
    Então vê conta e campos de anúncio demonstrativos
    E a tela informa que nada será publicado

  Cenário: simular o preenchimento e a revisão da campanha
    Dado que a pessoa preenche os campos obrigatórios
    Quando solicita a simulação
    Então vê uma confirmação local sem publicação real
*/
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoogleAdsCampaignMockPage } from './GoogleAdsCampaignMockPage';

describe('BDD: criação Google Ads em demonstração', () => {
  it('apresenta os campos de conta e anúncio e avisa que não publica', () => {
    render(<GoogleAdsCampaignMockPage />);

    expect(screen.getByLabelText('Conta Google Ads')).toBeInTheDocument();
    expect(screen.getByLabelText('Objetivo')).toBeInTheDocument();
    expect(screen.getByText(/nenhum anúncio será publicado/i)).toBeInTheDocument();
  });

  it('confirma a simulação local sem publicar a campanha', async () => {
    const user = userEvent.setup();
    render(<GoogleAdsCampaignMockPage />);

    fireEvent.change(screen.getByLabelText('Título do anúncio 1'), { target: { value: 'Padaria fresquinha perto de você' } });
    fireEvent.change(screen.getByLabelText('Título do anúncio 2'), { target: { value: 'Pães artesanais todos os dias' } });
    fireEvent.change(screen.getByLabelText('Título do anúncio 3'), { target: { value: 'Faça seu pedido hoje' } });
    fireEvent.change(screen.getByLabelText('Título longo'), { target: { value: 'Encontre pães fresquinhos e café da manhã na Padaria Modelo' } });
    fireEvent.change(screen.getByLabelText('Descrição 1'), { target: { value: 'Pães saindo do forno todos os dias.' } });
    fireEvent.change(screen.getByLabelText('Descrição 2'), { target: { value: 'Visite nossa loja no seu bairro.' } });
    fireEvent.change(screen.getByLabelText('Site de destino'), { target: { value: 'https://padaria.example' } });
    fireEvent.change(screen.getByLabelText('Imagem paisagem (1,91:1)'), { target: { value: 'https://assets.example/paisagem.jpg' } });
    fireEvent.change(screen.getByLabelText('Imagem quadrada (1:1)'), { target: { value: 'https://assets.example/quadrada.jpg' } });
    await user.click(screen.getByRole('button', { name: 'Simular criação' }));

    expect(screen.getByRole('status')).toHaveTextContent(/campanha pronta para revisão/i);
    expect(screen.getByRole('status')).toHaveTextContent(/não foi publicada/i);
  });
});
