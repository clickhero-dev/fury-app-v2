/*
# Language: pt-BR

Funcionalidade: escolher a plataforma da nova campanha

  Cenário: mostrar as opções Meta e Google
    Dado que a pessoa abriu o fluxo de nova campanha
    Quando a tela de escolha é exibida
    Então ela vê as opções Meta e Google

  Cenário: selecionar Google
    Dado que a pessoa vê as plataformas disponíveis
    Quando ela clica em Google
    Então o fluxo informa que a plataforma Google foi escolhida
*/
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignPlatformSelector } from './CampaignPlatformSelector';

describe('CampaignPlatformSelector — seleção de plataforma', () => {
  it('mostra Meta e Google', () => {
    render(<CampaignPlatformSelector value={null} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Meta/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Google/i })).toBeInTheDocument();
  });

  it('informa a seleção de Google', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CampaignPlatformSelector value={null} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Google/i }));

    expect(onChange).toHaveBeenCalledWith('google');
  });
});
