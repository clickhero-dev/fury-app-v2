import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { BillingApiResponse, Plan, SubscribePayload, Subscription } from '../types/billing';

export function usePlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: async (): Promise<Plan[]> => {
      const res = await api.get<BillingApiResponse<Plan[]>>('/billing/plans');
      return res.data.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: async (): Promise<Subscription | null> => {
      const res = await api.get<BillingApiResponse<Subscription | null>>('/billing/subscription');
      return res.data.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useSubscribe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SubscribePayload) => {
      const res = await api.post<BillingApiResponse<Subscription & { paymentLink?: string }>>(
        '/billing/subscribe',
        payload
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/billing/subscription');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
    },
  });
}
