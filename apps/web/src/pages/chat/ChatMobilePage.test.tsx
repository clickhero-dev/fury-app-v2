/**
 * Funcionalidade: conversa mobile do Ady
 *
 * Cenário: catálogo apresenta todas as capacidades disponíveis do MVP
 *   Dado que estou no chat mobile autenticado
 *   Quando abro o catálogo de capacidades
 *   Então vejo as seis capacidades e exemplos do que posso pedir
 *
 * Cenário: pedido ambíguo não executa ação externa
 *   Dado que envio um pedido sem uma intenção reconhecível
 *   Quando a mensagem é enviada
 *   Então recebo uma orientação sem uma confirmação de execução
 *
 * Cenário: confirmação delega a criação de imagem ao fluxo existente
 *   Dado que pedi para criar uma imagem
 *   Quando confirmo o resumo da ação
 *   Então sou levado uma vez ao fluxo de criação de imagem
 *
 * Cenário: cancelamento não produz efeito
 *   Dado que pedi para publicar uma postagem
 *   Quando cancelo a revisão
 *   Então permaneço no chat sem navegação para publicação
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ChatMobilePage } from './ChatMobilePage';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/conversa']}>
      <ChatMobilePage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

async function sendMessage(message: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: /mensagem para ady/i }), message);
  await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));
  return user;
}

describe('ChatMobilePage', () => {
  it('mostra as seis capacidades e exemplos ao abrir o catálogo', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /abrir capacidades/i }));

    for (const label of [
      'Criar vídeo', 'Criar imagem', 'Ver dados da campanha',
      'Publicar postagem', 'Agendar postagem', 'Criar campanha',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
    expect(screen.getByText(/exemplo: “crie uma imagem/i)).toBeInTheDocument();
  });

  it('pede esclarecimento para um pedido ambíguo', async () => {
    renderPage();
    await sendMessage('Me ajude com marketing');

    expect(screen.getByText(/posso criar imagem ou vídeo/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirmar/i })).not.toBeInTheDocument();
  });

  it('navega ao fluxo existente somente depois da confirmação da imagem', async () => {
    renderPage();
    const user = await sendMessage('Quero criar uma imagem para promoção');

    expect(screen.getByLabelText(/revisão da ação/i)).toHaveTextContent(/revisar: criar imagem/i);
    expect(screen.getByTestId('location')).toHaveTextContent('/conversa');

    await user.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/estudio?criar=rapida');
  });

  it('cancela publicação sem navegar para o calendário', async () => {
    renderPage();
    const user = await sendMessage('Publique uma postagem agora');

    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/conversa');
    expect(screen.getByText(/ação cancelada/i)).toBeInTheDocument();
  });
});
