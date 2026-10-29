/*
# Language: pt-BR

Funcionalidade: iniciar o fluxo de campanhas

  Cenário: abrir Nova campanha sem ação escolhida
    Dado que a pessoa entrou em Nova campanha
    Quando a página é carregada
    Então ela vê as opções Criar campanha e Ver campanhas

  Cenário: escolher criar campanha
    Dado que a pessoa está na entrada do fluxo
    Quando escolhe Criar campanha
    Então ela vê Meta e Google

  Cenário: escolher Meta
    Dado que a pessoa está na escolha de plataforma
    Quando ela escolhe Meta
    Então o wizard de campanhas Meta aparece

  Cenário: escolher Google
    Dado que a pessoa está na escolha de plataforma
    Quando ela escolhe Google
    Então o formulário Google Ads aparece

  Cenário: voltar da criação Google para a escolha de plataforma
    Dado que a pessoa escolheu Google
    Quando ela volta
    Então ela vê Meta e Google novamente

  Cenário: manter o alinhamento das páginas principais
    Dado que a pessoa abre a entrada de Campanhas
    Quando a página é carregada
    Então ela usa o mesmo container de Clientes e não repete o título Campanhas
*/
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CriarCampanhaPage } from './CriarCampanhaPage';

vi.mock('@/contexts/CampaignWizardContext', () => ({
  useCampaignWizardContext: () => ({ preSelectedAsset: null, clearPreSelectedAsset: vi.fn() }),
}));
vi.mock('@/components/campaign-wizard/CampaignWizard', () => ({
  CampaignWizard: () => <div data-testid="meta-campaign-wizard">Wizard Meta</div>,
}));
vi.mock('./GoogleAdsCampaignPage', () => ({
  GoogleAdsCampaignPage: ({ onBack }: { onBack?: () => void }) => (
    <div data-testid="google-ads-campaign-wizard">
      Wizard Google
      <button type="button" onClick={onBack}>Voltar da criação Google</button>
    </div>
  ),
}));
vi.mock('./GoogleAdsCampaignMockPage', () => ({
  GoogleAdsCampaignMockPage: ({ onBack }: { onBack?: () => void }) => (
    <div data-testid="google-ads-campaign-mock">Formulário Google demonstrativo<button type="button" onClick={onBack}>Voltar da criação Google</button></div>
  ),
}));

function renderPage(entry = '/criar-campanha') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CriarCampanhaPage />
    </MemoryRouter>
  );
}

describe('CriarCampanhaPage — escolha de plataforma', () => {
  it('mostra Meta e Google ao iniciar', () => {
    renderPage();

    expect(screen.getByRole('button', { name: /Criar campanha/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver campanhas/i })).toBeInTheDocument();
  });

  it('mostra Meta e Google depois de escolher criar campanha', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Criar campanha/i }));

    expect(screen.getByRole('button', { name: /Meta/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Google/i })).toBeInTheDocument();
  });

  it('abre o wizard Meta', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Criar campanha/i }));
    await user.click(screen.getByRole('button', { name: /Meta/i }));

    expect(screen.getByTestId('meta-campaign-wizard')).toBeInTheDocument();
  });

  it('abre o formulário Google Ads', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Criar campanha/i }));
    await user.click(screen.getByRole('button', { name: /Google/i }));

    expect(screen.getByTestId('google-ads-campaign-mock')).toBeInTheDocument();
  });

  it('mantém o fluxo integrado Google isolado e explícito para a fase seguinte', async () => {
    renderPage('/criar-campanha?platform=google&modo=integracao');

    expect(screen.getByTestId('google-ads-campaign-wizard')).toBeInTheDocument();
  });

  it('volta do formulário Google para a escolha de plataforma', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Criar campanha/i }));
    await user.click(screen.getByRole('button', { name: /Google/i }));
    await user.click(screen.getByRole('button', { name: /Voltar da criação Google/i }));

    expect(screen.getByRole('button', { name: /Meta/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Google/i })).toBeInTheDocument();
  });

  it('usa o container padrão e não repete o título Campanhas', () => {
    const { container } = renderPage();

    const pageShell = container.querySelector('.max-w-5xl');
    expect(pageShell).toHaveClass('px-6', 'pt-2', 'sm:px-10');
    expect(screen.queryByText('Campanhas', { selector: 'p' })).not.toBeInTheDocument();
  });
});
