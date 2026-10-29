/*
# Language: pt-BR

Funcionalidade: gerenciar o Perfil da Empresa com dados de demonstração

  Cenário: consultar resumo, avaliações e fotos pelos separadores
    Dado que a pessoa abre o Perfil Google
    Quando seleciona um separador
    Então o conteúdo correspondente é exibido com aviso de demonstração

  Cenário: guardar uma nota apenas para a equipe
    Dado que há uma avaliação sem nota interna
    Quando a pessoa salva uma nota interna
    Então a nota aparece como privada e não como resposta pública

  Cenário: publicar uma resposta simulada a uma avaliação
    Dado que há uma avaliação sem resposta
    Quando a pessoa escreve e envia uma resposta
    Então a resposta aparece no cartão como resposta pública simulada

  Cenário: adicionar uma foto sem enviar ao Google
    Dado que a pessoa está na aba Fotos
    Quando seleciona um arquivo de imagem
    Então a prévia aparece localmente e a tela informa que não houve envio
*/
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { GoogleMeuNegocioMock } from './GoogleMeuNegocioMock';

describe('BDD: Perfil Google em demonstração', () => {
  it('navega entre resumo, avaliações e fotos', () => {
    render(<GoogleMeuNegocioMock />);

    expect(screen.getByText('Padaria Modelo')).toBeInTheDocument();
    expect(screen.getByText(/dados demonstrativos/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Avaliações' }));
    expect(screen.getByRole('tabpanel', { name: 'Avaliações' })).toBeInTheDocument();
    expect(screen.getByText('Mariana S.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Fotos' }));
    expect(screen.getByRole('tabpanel', { name: 'Fotos' })).toBeInTheDocument();
    expect(screen.getByText('Pães artesanais · Capa')).toBeInTheDocument();
  });

  it('salva uma nota privada sem transformá-la em resposta pública', () => {
    render(<GoogleMeuNegocioMock />);
    fireEvent.click(screen.getByRole('tab', { name: 'Avaliações' }));

    const review = screen.getByTestId('review-review-2');
    const note = within(review).getByRole('textbox', { name: 'Nota interna (só para sua equipe)' });
    fireEvent.change(note, { target: { value: 'Checar tempo de espera no balcão.' } });
    fireEvent.click(within(review).getByRole('button', { name: 'Salvar nota interna' }));

    expect(within(review).getByText('Nota privada salva nesta demonstração')).toBeInTheDocument();
    expect(within(review).queryByText('Checar tempo de espera no balcão.', { selector: '[data-public-reply]' })).not.toBeInTheDocument();
  });

  it('envia uma resposta pública simulada independente da nota interna', () => {
    render(<GoogleMeuNegocioMock />);
    fireEvent.click(screen.getByRole('tab', { name: 'Avaliações' }));

    const review = screen.getByTestId('review-review-2');
    fireEvent.click(within(review).getByRole('button', { name: 'Responder' }));
    fireEvent.change(within(review).getByRole('textbox', { name: 'Resposta pública' }), {
      target: { value: 'Obrigado pelo comentário, Rafael!' },
    });
    fireEvent.click(within(review).getByRole('button', { name: 'Enviar resposta' }));

    expect(within(review).getByText('Obrigado pelo comentário, Rafael!')).toBeInTheDocument();
    expect(within(review).getByText(/não enviada ao Google/i)).toBeInTheDocument();
  });

  it('mostra a prévia local da foto sem fazer upload', () => {
    render(<GoogleMeuNegocioMock />);
    fireEvent.click(screen.getByRole('tab', { name: 'Fotos' }));

    const file = new File(['demo'], 'vitrine.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Adicionar foto de demonstração'), {
      target: { files: [file] },
    });

    expect(screen.getByText('vitrine.jpg')).toBeInTheDocument();
    expect(screen.getByText(/não foi enviada ao Google/i)).toBeInTheDocument();
  });
});
