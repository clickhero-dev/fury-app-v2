import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampaignWizard } from '@/components/campaign-wizard/CampaignWizard';
import { PageHeader } from '@/components/PageHeader';
import { useCampaignWizardContext } from '@/contexts/CampaignWizardContext';
import { showSnack } from '@/lib/snack';

export function CriarCampanhaPage() {
  const navigate = useNavigate();
  const { preSelectedAsset, clearPreSelectedAsset } = useCampaignWizardContext();

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

  return (
    <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 pt-4 pb-8 flex flex-col min-h-screen">
      {/* Cabeçalho padrão da aplicação — mesma convenção das outras páginas */}
      <PageHeader
        title="Criar Campanha"
        description="Dê vida a um novo anúncio em poucos passos: objetivo, criativo, público e orçamento."
      />

      {/* Wizard Content */}
      <div className="flex-1 min-h-0 mt-4">
        <CampaignWizard
          mode="page"
          preSelectedAssetId={preSelectedAsset?.id}
          preSelectedAssetUrl={preSelectedAsset?.url}
          onViewCampaigns={handleViewCampaigns}
          onCreateAnother={handleCreateAnother}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}