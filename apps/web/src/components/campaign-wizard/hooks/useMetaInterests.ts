import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface MetaInterestOption {
  id: string;
  name: string;
  audience_size?: number;
  path?: string[];
}

interface MetaInterestsResponse {
  success: true;
  data: MetaInterestOption[];
}

export function useMetaInterests(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const enabled = debouncedQuery.trim().length >= 2;

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns/meta-interests', debouncedQuery],
    queryFn: async () => {
      const response = await api.get<MetaInterestsResponse>('/campaigns/meta-interests', {
        params: { q: debouncedQuery },
      });
      return response.data.data;
    },
    enabled,
  });

  return {
    interests: enabled ? (data ?? []) : [],
    isLoading: enabled && isLoading,
  };
}
