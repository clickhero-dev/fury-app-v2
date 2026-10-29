import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CampaignWizard } from '@/components/campaign-wizard/CampaignWizard';
import { PageHeader } from '@/components/PageHeader';
import { useCampaignWizardContext } from '@/contexts/CampaignWizardContext';
import { showSnack } from '@/lib/snack';
import { CampaignPlatformSelector, type CampaignPlatform } from './CampaignPlatformSelector';
import { GoogleAdsCampaignPage } from './GoogleAdsCampaignPage';
import { GoogleAdsCampaignMockPage } from './GoogleAdsCampaignMockPage';
import { CampaignEntryChoice } from './CampaignEntryChoice';

export function CriarCampanhaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { preSelectedAsset, clearPreSelectedAsset } = useCampaignWizardContext();
  const [platform, setPlatform] = useState<CampaignPlatform | null>(() =>
    searchParams.get('platform') === 'google' ? 'google' : null
  );
  const [entryChoice, setEntryChoice] = useState<'create' | null>(() =>
    searchParams.get('platform') === 'google' ? 'create' : null,
  );
  const showIntegration = searchParams.get('modo') === 'integracao';

  useEffect(() => {
    // Clear the pre-selected asset when the component unmounts
    return () => {
      clearPreSelectedAsset();
    };
  }, [clearPreSelectedAsset]);

  function handleCancel() {
    clearPreSelectedAsset();
    // Redireciona para o dashboard com um snack de confirmação
    showSnack('Campanha cancelada com sucesso');
    navigate('/dashboard');
  }

  function handleViewCampaigns() {
    clearPreSelectedAsset();
    navigate('/campanhas');
  }

  function handleCreateAnother() {
    clearPreSelectedAsset();
    // Stay on the page with cleared state for creating another campaign
  }

  function handleBackToEntry() {
    setPlatform(null);
    setEntryChoice(null);
  }

  function handleBackToPlatform() {
    setPlatform(null);
    setEntryChoice('create');
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col space-y-6 px-6 pt-2 pb-8 sm:px-10">
      {/* Cabeçalho padrão da aplicação — mesma convenção das outras páginas */}
      <PageHeader
        title="Campanhas"
        description="Crie uma campanha nova ou acompanhe os anúncios que já estão rodando."
      />

      {/* Wizard Content */}
      <div className="flex-1 min-h-0 mt-4">
        {!entryChoice && (
          <CampaignEntryChoice
            onCreate={() => setEntryChoice('create')}
            onView={handleViewCampaigns}
          />
        )}
        {entryChoice === 'create' && !platform && (
          <div className="space-y-4">
            <button type="button" onClick={handleBackToEntry} className="text-sm font-semibold text-text-secondary hover:text-text-primary">
              ← Voltar
            </button>
            <CampaignPlatformSelector value={platform} onChange={setPlatform} />
          </div>
        )}
        {platform === 'meta' && (
          <CampaignWizard
            mode="page"
            preSelectedAssetId={preSelectedAsset?.id}
            preSelectedAssetUrl={preSelectedAsset?.url}
            preSelectedAssetIsVideo={preSelectedAsset?.isVideo}
            onViewCampaigns={handleViewCampaigns}
            onCreateAnother={handleCreateAnother}
            onCancel={handleCancel}
          />
        )}
        {platform === 'google' && (showIntegration
          ? <GoogleAdsCampaignPage onBack={handleBackToPlatform} />
          : <GoogleAdsCampaignMockPage onBack={handleBackToPlatform} />)}
      </div>
    </div>
  );
}
