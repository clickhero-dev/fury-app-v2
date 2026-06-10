import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { BillingApiResponse, InvoiceHistoryItem, Plan, SubscribePayload, Subscription } from '../types/billing';

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
      try {
        const res = await api.get<BillingApiResponse<Subscription | null>>('/billing/subscription');
        return res.data.data;
      } catch {
        return null;
      }
    },
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: async (): Promise<InvoiceHistoryItem[]> => {
      const res = await api.get<BillingApiResponse<InvoiceHistoryItem[]>>('/billing/invoices');
      return res.data.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
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
