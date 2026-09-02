import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampaignWizard } from '@/components/campaign-wizard/CampaignWizard';
import { useCampaignWizardContext } from '@/contexts/CampaignWizardContext';

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
    // Stay on the page with cleared state (as per user decision)
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">Criar Campanha</h1>
        </div>
      </div>

      {/* Wizard Content */}
      <div className="flex-1 overflow-hidden">
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