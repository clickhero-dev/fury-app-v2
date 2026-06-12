import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface AssetSelectionPage {
  pageId: string;
  name: string;
  hasInstagram: boolean;
  instagramUserId: string | null;
  instagramUsername: string | null;
  hasWhatsApp: boolean;
}

export interface AssetSelectionAdAccount {
  adAccountId: string;
  name: string;
}

export interface AssetSelectionWhatsappNumber {
  phoneNumberId: string;
  displayPhoneNumber: string;
}

export interface AssetSelectionBusiness {
  businessId: string;
  name: string;
}

export interface MetaAssetSelection {
  pages: AssetSelectionPage[];
  adAccounts: AssetSelectionAdAccount[];
  whatsappNumbers: AssetSelectionWhatsappNumber[];
  businesses: AssetSelectionBusiness[];
}

interface MetaAssetSelectionResponse {
  success: true;
  data: MetaAssetSelection;
}

export function useMetaAssetSelection() {
  return useQuery({
    queryKey: ['meta/asset-selection'],
    queryFn: async () => {
      const response = await api.get<MetaAssetSelectionResponse>('/meta/asset-selection');
      return response.data.data;
    },
  });
}
