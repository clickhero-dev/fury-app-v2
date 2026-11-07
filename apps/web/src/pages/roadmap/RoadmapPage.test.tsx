/*
Funcionalidade: consultar o Roadmap público

Cenário: dataset vazio
  Dado um visitante sem sessão
  Quando acessa o Roadmap sem itens publicados
  Então vê a mensagem de atualização sem promessas antigas ou resumo fictício

Cenário: dataset publicado
  Dado um dataset com marcos concluídos, em andamento e planejados
  Quando a página renderiza
  Então cada marco aparece uma vez e o resumo acompanha os estados reais

Cenário: interação acessível
  Dado um marco recolhido
  Quando a pessoa usa teclado para abri-lo
  Então o painel é associado por aria-controls e aria-expanded muda
*/
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RoadmapPage } from './RoadmapPage';
import type { Milestone } from './roadmapData';

const item = (overrides: Partial<Milestone>): Milestone => ({
  period: 'Jan 2027',
  title: 'Marco de teste',
  summary: 'Resumo de teste.',
  gains: ['Ganho de teste'],
  status: 'planned',
  ...overrides,
});

describe('RoadmapPage', () => {
  it('mostra o estado vazio sem resumo ou promessas antigas', () => {
    render(<RoadmapPage items={[]} />);

    expect(screen.getByRole('heading', { name: 'Roadmap do Ady', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Estamos atualizando nosso roadmap. Volte em breve para acompanhar as novidades.')).toBeInTheDocument();
    expect(screen.queryByText('Já entregue')).not.toBeInTheDocument();
    expect(screen.queryByText(/Google|WhatsApp/i)).not.toBeInTheDocument();
  });

  it('renderiza cada marco uma vez e deriva as contagens', () => {
    const items = [
      item({ period: 'Jan 2027', title: 'Concluído', status: 'done' }),
      item({ period: 'Fev 2027', title: 'Atual', status: 'active', current: true }),
      item({ period: 'Mar 2027', title: 'Depois', status: 'planned' }),
    ];

    render(<RoadmapPage items={items} />);

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(screen.getByText('1 capítulo concluído na trajetória do Ady')).toBeInTheDocument();
    expect(screen.getByText('1 capítulo atual')).toBeInTheDocument();
    expect(screen.getByText('1 capítulo a caminho')).toBeInTheDocument();
    expect(screen.getByText('Concluído', { selector: 'h3' })).toBeInTheDocument();
  });

  it('abre e fecha um marco pelo teclado com semântica ARIA', async () => {
    const user = userEvent.setup();
    render(<RoadmapPage items={[item({ title: 'Marco recolhido' })]} />);

    const toggle = screen.getByRole('button', { name: /Marco recolhido/i });
    const panelId = toggle.getAttribute('aria-controls');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toBeInTheDocument();

    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(panelId!)).toBeInTheDocument();
    expect(toggle).toHaveFocus();

    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
