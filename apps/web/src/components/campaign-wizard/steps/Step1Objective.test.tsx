import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Step1Objective } from './Step1Objective';

describe('Step1Objective — tipos de campanha', () => {
  it('exibe os dois tipos de campanha com seus títulos', () => {
    render(<Step1Objective value={null} onChange={vi.fn()} />);

    expect(screen.getByText('Conversas WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Gerar Conversas')).toBeInTheDocument();
  });

  it('descrição de "Gerar Conversas" não duplica o termo WhatsApp', () => {
    render(<Step1Objective value={null} onChange={vi.fn()} />);

    // A descrição de "Gerar Conversas" mantém Facebook/Messenger e Instagram,
    // mas não repete WhatsApp (que já está no título do outro tipo)
    const gerarConversasCard = screen.getByText('Gerar Conversas').closest('button');
    expect(gerarConversasCard).not.toBeNull();
    expect(gerarConversasCard!.textContent).not.toMatch(/whatsapp/i);
    expect(gerarConversasCard!.textContent).toMatch(/facebook|messenger/i);
    expect(gerarConversasCard!.textContent).toMatch(/instagram/i);
  });
});