import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Step1Objective } from './Step1Objective';

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

  it('Cenário: destino das mensagens só aparece ao escolher Gerar Conversas', () => {
    render(
      <Step1Objective
        value="whatsapp_conv"
        onChange={vi.fn()}
        whatsapp={{ pageId: 'page-1', hasInstagram: true, destinations: [] }}
        onWhatsappChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('Destino das mensagens')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /instagram/i })).not.toBeInTheDocument();
  });
});
