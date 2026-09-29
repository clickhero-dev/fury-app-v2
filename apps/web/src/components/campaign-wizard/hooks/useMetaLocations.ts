import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface MetaLocationOption {
  key: string;
  name: string;
  region?: string;
  country_code?: string;
  type?: string;
}

interface MetaLocationsResponse {
  success: true;
  data: MetaLocationOption[];
}

// types omitido = só cidades (Passo 3)
export function useMetaLocations(query: string, tenantId?: string, types?: string[]) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const enabled = debouncedQuery.trim().length >= 2;

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns/meta-locations', debouncedQuery, tenantId, types?.join(',')],
    queryFn: async () => {
      const params: { q: string; tenantId?: string; types?: string } = { q: debouncedQuery };
      if (tenantId) {
        params.tenantId = tenantId;
      }
      if (types?.length) params.types = types.join(',');
      const response = await api.get<MetaLocationsResponse>('/campaigns/meta-locations', {
        params,
      });
      return response.data.data;
    },
    enabled,
  });

  return {
    locations: enabled ? (data ?? []) : [],
    isLoading: enabled && isLoading,
  };
}
