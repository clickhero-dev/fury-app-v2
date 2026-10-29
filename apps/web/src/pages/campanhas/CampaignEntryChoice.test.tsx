/*
# Language: pt-BR

Funcionalidade: iniciar o fluxo de campanhas

  Cenário: escolher criar campanha
    Dado que a pessoa entrou em Nova campanha
    Quando escolhe Criar campanha
    Então a escolha de plataforma aparece

  Cenário: escolher ver campanhas
    Dado que a pessoa entrou em Nova campanha
    Quando escolhe Ver campanhas
    Então ela é levada ao painel de campanhas
*/
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignEntryChoice } from './CampaignEntryChoice';

describe('CampaignEntryChoice — entrada do fluxo', () => {
  it('chama a ação de criar campanha', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<CampaignEntryChoice onCreate={onCreate} onView={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Criar campanha/i }));

    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('chama a ação de ver campanhas', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    render(<CampaignEntryChoice onCreate={vi.fn()} onView={onView} />);

    await user.click(screen.getByRole('button', { name: /Ver campanhas/i }));

    expect(onView).toHaveBeenCalledOnce();
  });
});
