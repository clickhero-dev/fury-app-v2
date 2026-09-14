import { createContext, useContext, useState, ReactNode } from 'react';

interface PreSelectedAsset {
  id?: string;
  url?: string;
}

interface CampaignWizardContextValue {
  preSelectedAsset: PreSelectedAsset | null;
  setPreSelectedAsset: (asset: PreSelectedAsset | null) => void;
  clearPreSelectedAsset: () => void;
}

const CampaignWizardContext = createContext<CampaignWizardContextValue | undefined>(undefined);

export function CampaignWizardProvider({ children }: { children: ReactNode }) {
  const [preSelectedAsset, setPreSelectedAssetState] = useState<PreSelectedAsset | null>(null);

  const setPreSelectedAsset = (asset: PreSelectedAsset | null) => {
    setPreSelectedAssetState(asset);
  };

  const clearPreSelectedAsset = () => {
    setPreSelectedAssetState(null);
  };

  return (
    <CampaignWizardContext.Provider value={{ preSelectedAsset, setPreSelectedAsset, clearPreSelectedAsset }}>
      {children}
    </CampaignWizardContext.Provider>
  );
}

export function useCampaignWizardContext() {
  const context = useContext(CampaignWizardContext);
  if (!context) {
    throw new Error('useCampaignWizardContext must be used within CampaignWizardProvider');
  }
  return context;
}

export default CampaignWizardContext;