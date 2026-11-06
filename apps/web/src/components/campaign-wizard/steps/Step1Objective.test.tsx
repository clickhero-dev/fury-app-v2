import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Step1Objective } from './Step1Objective';

const mockAssetSelection = vi.hoisted(() => ({
  data: {
    pages: [{
      pageId: 'page-1', name: 'Página Fury', hasWhatsApp: true, hasInstagram: true,
      instagramUserId: 'ig-1', instagramUsername: 'fury',
    }],
  },
  isLoading: false,
  isError: false,
}));

vi.mock('../hooks/useMetaAssetSelection', () => ({
  useMetaAssetSelection: () => mockAssetSelection,
}));

/*
Funcionalidade: selecionar o destino das mensagens da campanha

Cenário: visualizar destinos disponíveis como opções claras
  Dado que a Página possui WhatsApp e Instagram conectados
  Quando o objetivo Gerar Conversas é selecionado
  Então Instagram e Facebook aparecem como cartões selecionáveis

Cenário: selecionar mais de um destino
  Dado que os cartões de destino estão disponíveis
  Quando seleciono Instagram e Facebook
  Então os dois cartões ficam marcados

Cenário: manter destino indisponível fora da seleção
  Dado que a Página não possui Instagram conectado
  Quando os destinos são exibidos
  Então Instagram aparece desabilitado e não pode ser selecionado
*/

function DestinationHarness({
  initialDestinations = [],
  hasInstagram = true,
}: { initialDestinations?: ('whatsapp' | 'instagram_direct' | 'messenger')[]; hasInstagram?: boolean }) {
  const [objective, setObjective] = useState<'whatsapp' | null>('whatsapp');
  const [whatsapp, setWhatsapp] = useState({
    pageId: 'page-1', pageName: 'Página Fury', hasWhatsApp: true, hasInstagram,
    destinations: initialDestinations,
    instagramUserId: hasInstagram ? 'ig-1' : undefined,
    instagramUsername: hasInstagram ? 'fury' : undefined,
  });
  return (
    <Step1Objective
      value={objective}
      onChange={setObjective}
      whatsapp={whatsapp}
      onWhatsappChange={(updates) => setWhatsapp((current) => ({ ...current, ...updates }))}
    />
  );
}

/*
Funcionalidade: seleção do objetivo da campanha

Cenário: exibir somente os objetivos de conversas e captação
  Dado que a pessoa inicia a criação de uma campanha
  Quando a etapa de objetivo é exibida
  Então ela vê "Gerar Conversas" e "Formulário de captação"
  E não vê "Conversas WhatsApp"
*/
describe('Step1Objective — tipos de campanha', () => {
  it('exibe somente os objetivos Gerar Conversas e Formulário de captação', () => {
    render(<Step1Objective value={null} onChange={vi.fn()} />);

    expect(screen.getByText('Gerar Conversas')).toBeInTheDocument();
    expect(screen.getByText('Formulário de captação')).toBeInTheDocument();
    expect(screen.queryByText('Conversas WhatsApp')).not.toBeInTheDocument();
  });

  it('descrição de "Gerar Conversas" não duplica o termo WhatsApp', () => {
    render(<Step1Objective value={null} onChange={vi.fn()} />);

    // A descrição de "Gerar Conversas" mantém Facebook/Messenger e Instagram.
    const gerarConversasCard = screen.getByText('Gerar Conversas').closest('button');
    expect(gerarConversasCard).not.toBeNull();
    expect(gerarConversasCard!.textContent).not.toMatch(/whatsapp/i);
    expect(gerarConversasCard!.textContent).toMatch(/facebook|messenger/i);
    expect(gerarConversasCard!.textContent).toMatch(/instagram/i);
  });
});

describe('Step1Objective — destinos de mensagens', () => {
  beforeEach(() => {
    mockAssetSelection.isLoading = false;
    mockAssetSelection.isError = false;
  });

  it('exibe Instagram e Facebook como cartões selecionáveis', () => {
    render(<DestinationHarness />);

    expect(screen.getByRole('checkbox', { name: /instagram/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /facebook/i })).toBeInTheDocument();
    expect(screen.getByText('Escolha um ou mais canais')).toBeInTheDocument();
  });

  it('permite selecionar Instagram e Facebook ao mesmo tempo ao clicar no card', () => {
    render(<DestinationHarness />);

    fireEvent.click(screen.getByText('Receba mensagens no Direct'));
    fireEvent.click(screen.getByText('Receba mensagens no Messenger'));

    expect(screen.getByRole('checkbox', { name: /instagram/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /facebook/i })).toBeChecked();
  });

  it('desabilita Instagram quando a Página não possui Instagram conectado', () => {
    render(<DestinationHarness hasInstagram={false} />);

    const instagram = screen.getByRole('checkbox', { name: /instagram/i });
    expect(instagram).toBeDisabled();
    expect(screen.getByText(/conecte sua conta do instagram/i)).toBeInTheDocument();
  });
});
