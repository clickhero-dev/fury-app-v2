import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Users, CreditCard } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { SectionNav, buildSectionSummaries, type SummarySource } from './SectionNav';

const labels = {
  objectives: [{ value: 'aumentar_vendas', label: 'Aumentar Vendas' }],
  genders: [{ value: 'all', label: 'Todos' }, { value: 'female', label: 'Mulheres' }],
  tones: [{ value: 'casual', label: 'Casual' }],
};

const empty: SummarySource = { users: [], subscription: null, furyConfig: null, goals: null, audienceDefaults: null, brandKit: null };

describe('SectionNav', () => {
  it('cada card tem o nome da seção e marca só o ativo', async () => {
    const onSelect = vi.fn();
    render(
      <SectionNav
        items={[
          { key: 'users', label: 'Usuários', icon: Users, line1: '2 usuários', line2: 'Vagas: 1 de 2' },
          { key: 'subscription', label: 'Assinatura', icon: CreditCard, line1: 'Pro', line2: 'Status: active' },
        ]}
        active="users"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('button', { name: 'Usuários' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Assinatura' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Usuários' })).toHaveAccessibleDescription('2 usuários Vagas: 1 de 2');

    await userEvent.click(screen.getByRole('button', { name: 'Assinatura' }));
    expect(onSelect).toHaveBeenCalledWith('subscription');
  });
});

describe('buildSectionSummaries', () => {
  it('resume os dados salvos do cliente', () => {
    const s = buildSectionSummaries(
      {
        users: [{ role: 'owner' }, { role: 'member' }],
        subscription: { status: 'active', plan: { name: 'Pro' } },
        furyConfig: { targetRoas: '3.5', targetCpa: '25' },
        goals: { objective: 'aumentar_vendas', monthlyBudget: 3000 },
        audienceDefaults: { ageMin: 25, ageMax: 45, gender: 'female', geo: { mode: 'regions', regionType: 'city', regions: [{ key: '1', name: 'Maringá', region: 'Paraná' }], points: [] } },
        brandKit: { voiceTone: 'casual', primaryColor: '#111111', secondaryColor: '#222222', photoUrls: ['a', 'b'] },
      },
      { isSuperAdmin: false, maxMembers: 2, labels },
    );
    expect(s.users).toEqual({ line1: '2 usuários', line2: 'Vagas: 1 de 2' });
    expect(s.subscription).toEqual({ line1: 'Pro', line2: 'Status: active' });
    expect(s.config).toEqual({ line1: 'ROAS 3.5x', line2: 'CPA R$ 25,00' });
    expect(s.metas).toEqual({ line1: 'Aumentar Vendas', line2: 'R$ 3.000,00/mês' });
    expect(s.publico).toEqual({ line1: '25 até 45 · Mulheres', line2: 'Maringá, Paraná' });
    expect(s.brandkit).toEqual({ line1: 'Casual', line2: '2 fotos', swatches: ['#111111', '#222222'] });
  });

  it('usa textos de vazio quando nada foi configurado', () => {
    const s = buildSectionSummaries(empty, { isSuperAdmin: true, maxMembers: 2, labels });
    expect(s.users.line2).toBe('Sem limite de vagas');
    expect(s.subscription.line1).toBe('Sem assinatura');
    expect(s.config.line1).toBe('Não configurado');
    expect(s.metas.line1).toBe('Não definidas');
    expect(s.publico).toEqual({ line1: '18 até 65 · Todos', line2: 'Sem localização' });
    expect(s.brandkit).toEqual({ line1: 'Sem tom de voz', line2: '0 fotos', swatches: undefined });
  });

  it('cidade antiga aparece quando não há localização nova', () => {
    const s = buildSectionSummaries({ ...empty, audienceDefaults: { city: 'Londrina' } }, { isSuperAdmin: false, maxMembers: 2, labels });
    expect(s.publico.line2).toBe('Londrina');
  });
});
